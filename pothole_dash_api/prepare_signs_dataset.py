"""
Prépare data/signs/train et data/signs/val pour entraîner le modèle signalétique.

Sources supportées:
  - torchvision  : télécharge GTSRB (benchmark allemand, 43 classes) — recommandé pour démarrer
  - kaggle_folder: dossier déjà extrait depuis Kaggle (sous-dossiers = classes)

Exemples Kaggle utiles (classification, même pipeline que les nids-de-poule):
  - https://www.kaggle.com/datasets/meowmeowmeowmeowmeow/gtsrb-german-traffic-sign
  - https://www.kaggle.com/datasets/ahemateja19bec1025/traffic-sign-dataset-classification
  - https://www.kaggle.com/datasets/safabouguezzi/german-traffic-sign-detection-benchmark-gtsdb (détection bbox — nécessite YOLO, pas ce script)

Usage:
  python prepare_signs_dataset.py --source torchvision
  python prepare_signs_dataset.py --source kaggle_folder --raw_dir data/kaggle_signs
"""

from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".ppm"}


def iter_images(class_dir: Path):
    for p in class_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXTS:
            yield p


def split_raw_to_train_val(raw_dir: Path, out_dir: Path, val_ratio: float, seed: int, max_per_class: int | None):
    train_dir = out_dir / "train"
    val_dir = out_dir / "val"
    for d in (train_dir, val_dir):
        if d.exists():
            shutil.rmtree(d)
    train_dir.mkdir(parents=True, exist_ok=True)
    val_dir.mkdir(parents=True, exist_ok=True)

    classes = sorted([p.name for p in raw_dir.iterdir() if p.is_dir()])
    if not classes:
        raise SystemExit(f"Aucun dossier classe dans {raw_dir}")

    random.seed(seed)
    stats = {"classes": len(classes), "train": 0, "val": 0}

    for cls in classes:
        imgs = list(iter_images(raw_dir / cls))
        if max_per_class and len(imgs) > max_per_class:
            random.shuffle(imgs)
            imgs = imgs[:max_per_class]
        random.shuffle(imgs)
        n_val = max(1, int(len(imgs) * val_ratio)) if len(imgs) > 1 else 0
        val_set = set(imgs[:n_val])

        for src in imgs:
            dst_root = val_dir if src in val_set else train_dir
            dst = dst_root / cls / src.name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            stats["val" if src in val_set else "train"] += 1

    print(f"Classes: {stats['classes']}, train: {stats['train']}, val: {stats['val']}")
    print("Sortie:", out_dir.resolve())


def export_gtsrb_torchvision(raw_dir: Path):
    """Télécharge GTSRB et copie les images train dans raw_dir/<class_id>/."""
    try:
        from torchvision.datasets import GTSRB
    except ImportError as e:
        raise SystemExit("Installe les dépendances: pip install -r requirements.txt") from e

    raw_dir.mkdir(parents=True, exist_ok=True)
    ds = GTSRB(root=str(raw_dir.parent / "gtsrb_cache"), split="train", download=True)
    print(f"GTSRB: {len(ds)} images, classes 0..42")

    for idx in range(len(ds)):
        img, label = ds[idx]
        cls = f"class_{label:02d}"
        out_cls = raw_dir / cls
        out_cls.mkdir(parents=True, exist_ok=True)
        out_path = out_cls / f"{idx:06d}.png"
        if not out_path.exists():
            img.save(out_path)
        if (idx + 1) % 5000 == 0:
            print(f"  copié {idx + 1}/{len(ds)}…")

    print("GTSRB exporté vers", raw_dir.resolve())


def normalize_kaggle_tree(src: Path, raw_dir: Path):
    """
    Accepte plusieurs layouts Kaggle courants:
      - Train/0/*.png
      - train/Stop/*.jpg
      - 00000/*.ppm (GTSRB zip)
    """
    raw_dir.mkdir(parents=True, exist_ok=True)

    candidates = [src]
    for name in ("Train", "train", "Training", "GTSRB/Final_Training/Images"):
        p = src / name
        if p.exists():
            candidates = [p]
            break

    root = candidates[0]
    class_dirs = [p for p in root.iterdir() if p.is_dir()]
    if not class_dirs:
        raise SystemExit(f"Aucun dossier classe trouvé sous {root}. Vérifie l'extraction Kaggle.")

    for cls_dir in sorted(class_dirs, key=lambda p: p.name):
        cls = cls_dir.name
        out_cls = raw_dir / cls
        out_cls.mkdir(parents=True, exist_ok=True)
        n = 0
        for img in iter_images(cls_dir):
            dst = out_cls / img.name
            if not dst.exists():
                shutil.copy2(img, dst)
            n += 1
        print(f"  {cls}: {n} images")


def main():
    parser = argparse.ArgumentParser(description="Préparer le dataset signalétique (train/val)")
    parser.add_argument("--source", choices=["torchvision", "kaggle_folder"], default="torchvision")
    parser.add_argument("--raw_dir", type=str, default="data/signs_raw", help="Dossier classes (kaggle ou après GTSRB)")
    parser.add_argument("--out_dir", type=str, default="data/signs", help="Sortie train/val")
    parser.add_argument("--val_ratio", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--kaggle_src",
        type=str,
        default="data/kaggle_signs",
        help="Dossier extrait du zip Kaggle (si --source kaggle_folder)",
    )
    parser.add_argument(
        "--max_per_class",
        type=int,
        default=None,
        help="Limite images/classe (utile pour tests rapides, ex: 500)",
    )
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    out_dir = Path(args.out_dir)

    if args.source == "torchvision":
        export_gtsrb_torchvision(raw_dir)
    else:
        kaggle_src = Path(args.kaggle_src)
        if not kaggle_src.exists():
            raise SystemExit(
                f"Dossier Kaggle introuvable: {kaggle_src}\n"
                "1) Télécharge un dataset sur kaggle.com (voir README SIGNS.md)\n"
                "2) Extrais le zip dans data/kaggle_signs/\n"
                "3) Relance avec --kaggle_src <chemin>"
            )
        normalize_kaggle_tree(kaggle_src, raw_dir)

    split_raw_to_train_val(raw_dir, out_dir, args.val_ratio, args.seed, args.max_per_class)


if __name__ == "__main__":
    main()
