import io
from dataclasses import dataclass
from typing import List, Tuple

import torch
from PIL import Image
from torchvision import models, transforms


@dataclass(frozen=True)
class LoadedModel:
    model: torch.nn.Module
    classes: List[str]
    img_size: int
    device: str


def load_model(model_path: str) -> LoadedModel:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    ckpt = torch.load(model_path, map_location=device)
    classes = ckpt["classes"]
    img_size = int(ckpt.get("img_size", 224))

    arch = ckpt.get("arch", "resnet18")
    if arch != "resnet18":
        raise ValueError(f"Unsupported arch in checkpoint: {arch}")

    model = models.resnet18(weights=None)
    model.fc = torch.nn.Linear(model.fc.in_features, len(classes))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    model.to(device)

    return LoadedModel(model=model, classes=classes, img_size=img_size, device=device)


def _preprocess(img: Image.Image, img_size: int) -> torch.Tensor:
    tfm = transforms.Compose(
        [
            transforms.ConvertImageDtype(torch.float32),
        ]
    )
    # torchvision transforms expect tensor; easiest: do PIL -> tensor with ToTensor, then normalize
    pil_tfm = transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    x = pil_tfm(img.convert("RGB"))
    return tfm(x)


@torch.no_grad()
def predict_bytes(loaded: LoadedModel, image_bytes: bytes, topk: int = 3) -> Tuple[str, float, List[dict]]:
    img = Image.open(io.BytesIO(image_bytes))
    x = _preprocess(img, loaded.img_size).unsqueeze(0).to(loaded.device)
    logits = loaded.model(x)
    probs = torch.softmax(logits, dim=1).squeeze(0)

    k = min(topk, probs.numel())
    vals, idx = torch.topk(probs, k=k)
    top = []
    for v, i in zip(vals.tolist(), idx.tolist()):
        top.append({"label": loaded.classes[i], "prob": float(v)})

    best = top[0]
    return best["label"], float(best["prob"]), top

