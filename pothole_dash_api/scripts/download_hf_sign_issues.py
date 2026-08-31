"""
Télécharge des images « panneaux / signalisation abîmée » depuis Hugging Face
vers data/signs_damage_raw/sign_damaged/ (pour entraînement folders).

Usage:
  python -m pip install datasets pillow
  python scripts/download_hf_sign_issues.py --max_images 150
"""

from __future__ import annotations

import argparse
from pathlib import Path

SIGN_KEYWORDS = (
    "sign",
    "signage",
    "traffic",
    "panneau",
    "signal",
    "graffiti",
    "vandal",
)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--max_images", type=int, default=150)
    p.add_argument("--out_dir", default="data/signs_damage_raw/sign_damaged")
    args = p.parse_args()

    try:
        from datasets import load_dataset
    except ImportError:
        raise SystemExit("Installez: python -m pip install datasets pillow")

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    print("Chargement dataset Hugging Face (peut prendre quelques minutes la 1ère fois)…")
    ds = load_dataset("Programmer-RD-AI/road-issues-detection-dataset", split="train", trust_remote_code=True)

    saved = 0
    for i, row in enumerate(ds):
        if saved >= args.max_images:
            break
        label = str(row.get("label") or row.get("category") or row.get("class") or "").lower()
        if not any(k in label for k in SIGN_KEYWORDS):
            continue
        img = row.get("image")
        if img is None:
            continue
        path = out / f"hf_{saved:05d}.jpg"
        img.save(path, format="JPEG", quality=90)
        saved += 1
        if saved % 25 == 0:
            print(f"  {saved} images…")

    if saved == 0:
        print(
            "Aucune image filtrée. Utilisez Roboflow (OBTENIR_IMAGES.md) ou copiez des .jpg manuellement."
        )
    else:
        print(f"OK: {saved} images dans {out.resolve()}")
        print("Ensuite:")
        print("  python prepare_signs_damage_yolo.py --mode folders")
        print("  python train_signs_damage_yolo.py --epochs 40")


if __name__ == "__main__":
    main()
