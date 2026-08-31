import argparse
import json
import os
import random
import shutil
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def iter_images(class_dir: Path):
    for p in class_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXTS:
            yield p


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw_dir", type=str, required=True, help="e.g. data/raw")
    parser.add_argument("--out_dir", type=str, required=True, help="e.g. data")
    parser.add_argument("--val_ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    out_dir = Path(args.out_dir)
    train_dir = out_dir / "train"
    val_dir = out_dir / "val"

    if not raw_dir.exists():
        raise SystemExit(f"raw_dir not found: {raw_dir}")

    classes = [p.name for p in raw_dir.iterdir() if p.is_dir()]
    classes.sort()
    if not classes:
        raise SystemExit(f"No class folders found inside: {raw_dir}")

    random.seed(args.seed)

    train_dir.mkdir(parents=True, exist_ok=True)
    val_dir.mkdir(parents=True, exist_ok=True)

    summary = {"classes": classes, "counts": {}}

    for cls in classes:
        src_cls_dir = raw_dir / cls
        images = list(iter_images(src_cls_dir))
        if not images:
            print(f"[warn] no images for class '{cls}' in {src_cls_dir}")
            continue
        random.shuffle(images)
        n_val = max(1, int(len(images) * args.val_ratio))
        val_imgs = images[:n_val]
        train_imgs = images[n_val:]

        (train_dir / cls).mkdir(parents=True, exist_ok=True)
        (val_dir / cls).mkdir(parents=True, exist_ok=True)

        for p in train_imgs:
            dst = train_dir / cls / p.name
            if not dst.exists():
                shutil.copy2(p, dst)
        for p in val_imgs:
            dst = val_dir / cls / p.name
            if not dst.exists():
                shutil.copy2(p, dst)

        summary["counts"][cls] = {"train": len(train_imgs), "val": len(val_imgs)}

    (out_dir / "split_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("Done. Wrote:", out_dir / "split_summary.json")
    print("Train:", train_dir)
    print("Val:", val_dir)


if __name__ == "__main__":
    main()

