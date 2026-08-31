import argparse
import json
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from tqdm import tqdm


def build_dataloaders(data_dir: Path, img_size: int, batch_size: int, num_workers: int):
    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    if not train_dir.exists() or not val_dir.exists():
        raise SystemExit(
            "Expected folders data/train and data/val.\n"
            "If you only have data/raw/<class> run:\n"
            "  python split_data.py --raw_dir data/raw --out_dir data --val_ratio 0.2"
        )

    train_tfms = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(10),
            transforms.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1, hue=0.02),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    val_tfms = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    train_ds = datasets.ImageFolder(train_dir.as_posix(), transform=train_tfms)
    val_ds = datasets.ImageFolder(val_dir.as_posix(), transform=val_tfms)

    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=True)
    val_dl = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=True)
    return train_ds, val_ds, train_dl, val_dl


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    correct = 0
    total = 0
    loss_sum = 0.0
    ce = nn.CrossEntropyLoss()
    for x, y in loader:
        x = x.to(device)
        y = y.to(device)
        logits = model(x)
        loss = ce(logits, y)
        loss_sum += float(loss.item()) * x.size(0)
        pred = logits.argmax(dim=1)
        correct += int((pred == y).sum().item())
        total += int(y.numel())
    return {"val_loss": loss_sum / max(1, total), "val_acc": correct / max(1, total)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", type=str, default="data")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--img_size", type=int, default=224)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--num_workers", type=int, default=0)  # windows-friendly default
    parser.add_argument("--freeze_backbone", action="store_true")
    parser.add_argument("--out_model", type=str, default="models/model.pt")
    parser.add_argument("--out_labels", type=str, default="models/labels.json")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    Path("models").mkdir(parents=True, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("device:", device)

    train_ds, val_ds, train_dl, val_dl = build_dataloaders(
        data_dir=data_dir,
        img_size=args.img_size,
        batch_size=args.batch_size,
        num_workers=args.num_workers,
    )

    num_classes = len(train_ds.classes)
    if num_classes < 2:
        raise SystemExit(f"Need at least 2 classes. Found: {train_ds.classes}")

    model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    if args.freeze_backbone:
        for p in model.parameters():
            p.requires_grad = False

    model.fc = nn.Linear(model.fc.in_features, num_classes)
    model.to(device)

    opt = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=args.lr)
    ce = nn.CrossEntropyLoss()

    best_acc = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        pbar = tqdm(train_dl, desc=f"epoch {epoch}/{args.epochs}", leave=False)
        for x, y in pbar:
            x = x.to(device)
            y = y.to(device)
            opt.zero_grad(set_to_none=True)
            logits = model(x)
            loss = ce(logits, y)
            loss.backward()
            opt.step()
            pbar.set_postfix(loss=float(loss.item()))

        metrics = evaluate(model, val_dl, device)
        print(f"epoch={epoch} val_loss={metrics['val_loss']:.4f} val_acc={metrics['val_acc']:.4f}")

        if metrics["val_acc"] > best_acc:
            best_acc = metrics["val_acc"]
            torch.save(
                {
                    "arch": "resnet18",
                    "img_size": args.img_size,
                    "state_dict": model.state_dict(),
                    "classes": train_ds.classes,
                },
                args.out_model,
            )
            Path(args.out_labels).write_text(json.dumps({"classes": train_ds.classes}, indent=2), encoding="utf-8")
            print("saved:", args.out_model)

    print("best_val_acc:", best_acc)


if __name__ == "__main__":
    main()

