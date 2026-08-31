"""
Prépare un dataset YOLO pour signalétique cassée.

Modes:
  1) Dossiers classification (sans bbox) — bbox = image entière (bootstrap)
     data/signs_damage_raw/sign_damaged/*.jpg
     data/signs_damage_raw/sign_ok/*.jpg

  2) Export YOLO Roboflow déjà prêt:
     data/yolo_import/images/train + labels/train

Puis entraîner:
  python train_signs_damage_yolo.py
"""

from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def iter_images(d: Path):
    for p in d.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXTS:
            yield p


def write_yolo_label(path: Path, class_id: int, box=(0.08, 0.08, 0.84, 0.84)):
    """box = cx, cy, w, h normalisés 0-1 (plein cadre par défaut)."""
    cx, cy, bw, bh = box
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{class_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n", encoding="utf-8")


def from_class_folders(raw_dir: Path, out_root: Path, val_ratio: float, seed: int):
    """
    sign_damaged → classe 0
    sign_ok      → classe 1 (optionnel, pour apprentissage)
    """
    mapping = {
        "sign_damaged": 0,
        "damaged": 0,
        "damaged_sign": 0,
        "broken": 0,
        "sign_ok": 1,
        "ok": 1,
        "intact": 1,
    }
    classes_found = []
    for name in sorted(raw_dir.iterdir()):
        if not name.is_dir():
            continue
        key = name.name.lower()
        if key not in mapping:
            print(f"  ignoré: {name.name} (renommer en sign_damaged ou sign_ok)")
            continue
        classes_found.append((name, mapping[key]))

    if not any(cid == 0 for _, cid in classes_found):
        raise SystemExit(
            f"Aucun dossier sign_damaged dans {raw_dir}\n"
            "Créez: data/signs_damage_raw/sign_damaged/ et copiez des .jpg dedans."
        )

    random.seed(seed)
    stats = {"train": 0, "val": 0}
    all_by_class: list[tuple[list[Path], int, str]] = []

    for cls_dir, class_id in classes_found:
        imgs = list(iter_images(cls_dir))
        if class_id == 0 and len(imgs) == 0:
            raise SystemExit(
                f"Aucune image dans {cls_dir}\n"
                "Copiez au moins 10 photos de panneaux cassés (.jpg) dans sign_damaged/ puis relancez."
            )
        all_by_class.append((imgs, class_id, cls_dir.name))

    for imgs, class_id, cls_name in all_by_class:
        random.shuffle(imgs)
        if len(imgs) == 1:
            splits = [("train", imgs), ("val", imgs)]
        else:
            n_val = max(1, int(len(imgs) * val_ratio))
            splits = [("val", imgs[:n_val]), ("train", imgs[n_val:])]

        for split, subset in splits:
            for src in subset:
                img_dst = out_root / "images" / split / f"{cls_name}_{src.stem}{src.suffix.lower()}"
                lbl_dst = out_root / "labels" / split / f"{cls_name}_{src.stem}.txt"
                img_dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, img_dst)
                write_yolo_label(lbl_dst, class_id)
                stats[split] += 1

    if stats["train"] == 0:
        raise SystemExit("Dataset vide après préparation. Vérifiez vos images dans sign_damaged/.")

    # YOLO exige que val/ existe
    val_img_dir = out_root / "images" / "val"
    if not val_img_dir.exists() or not any(val_img_dir.iterdir()):
        train_imgs = list((out_root / "images" / "train").glob("*"))
        if not train_imgs:
            raise SystemExit("Aucune image train.")
        src = train_imgs[0]
        val_img_dir.mkdir(parents=True, exist_ok=True)
        (out_root / "labels" / "val").mkdir(parents=True, exist_ok=True)
        dst = val_img_dir / src.name
        shutil.copy2(src, dst)
        lbl_src = out_root / "labels" / "train" / (src.stem + ".txt")
        if lbl_src.exists():
            shutil.copy2(lbl_src, out_root / "labels" / "val" / (src.stem + ".txt"))
        stats["val"] = max(1, stats["val"])
        print("Note: jeu val créé en copiant 1 image depuis train (peu de photos).")

    names = ["sign_damaged", "sign_ok"]
    _write_data_yaml(out_root, names)
    print("Dataset YOLO créé:", out_root.resolve())
    print("Classes:", names)
    print(f"Images — train: {stats['train']}, val: {stats['val']}")


def from_yolo_import(import_dir: Path, out_root: Path):
    """Copie export Roboflow: train/images, valid/images, etc."""
    import_dir = import_dir.resolve()
    stats = {"train": 0, "val": 0}

    def copy_split(src_name: str, dst_name: str):
        layouts = [
            (import_dir / src_name / "images", import_dir / src_name / "labels"),
            (import_dir / "images" / src_name, import_dir / "labels" / src_name),
        ]
        for src_img, src_lbl in layouts:
            if not src_img.exists():
                continue
            for img in iter_images(src_img):
                dst_img = out_root / "images" / dst_name / img.name
                dst_lbl = out_root / "labels" / dst_name / (img.stem + ".txt")
                dst_img.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(img, dst_img)
                lbl_src = src_lbl / (img.stem + ".txt")
                if lbl_src.exists():
                    dst_lbl.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(lbl_src, dst_lbl)
                stats[dst_name] += 1
            return

    copy_split("train", "train")
    copy_split("valid", "val")
    copy_split("val", "val")

    if stats["train"] == 0:
        raise SystemExit(f"Aucune image dans {import_dir} (attendu train/images/)")

    names = _read_class_names(import_dir) or ["Acceptable", "Good", "Poor", "Very good", "Very poor"]
    _write_data_yaml(out_root, names)
    print(f"Import Roboflow — train: {stats['train']}, val: {stats['val']}")


def _read_class_names(import_dir: Path) -> list[str] | None:
    yaml_path = import_dir / "data.yaml"
    if not yaml_path.exists():
        return None
    text = yaml_path.read_text(encoding="utf-8")
    if "names:" in text and "[" in text:
        import ast
        start = text.index("[")
        end = text.index("]", start) + 1
        try:
            return ast.literal_eval(text[start:end])
        except Exception:
            pass
    return None


def _write_data_yaml(out_root: Path, names: list[str]):
    content = f"""# Signalétique cassée — format YOLOv8
path: {out_root.resolve().as_posix()}
train: images/train
val: images/val
names:
"""
    for i, n in enumerate(names):
        content += f"  {i}: {n}\n"
    (out_root / "data.yaml").write_text(content, encoding="utf-8")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=["folders", "yolo_import"], default="folders")
    p.add_argument("--raw_dir", default="data/signs_damage_raw")
    p.add_argument("--import_dir", default="data/yolo_import")
    p.add_argument("--out_dir", default="data/signs_damage_yolo")
    p.add_argument("--val_ratio", type=float, default=0.15)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    out_root = Path(args.out_dir)
    if out_root.exists():
        shutil.rmtree(out_root)
    out_root.mkdir(parents=True)

    if args.mode == "folders":
        from_class_folders(Path(args.raw_dir), out_root, args.val_ratio, args.seed)
    else:
        from_yolo_import(Path(args.import_dir), out_root)


if __name__ == "__main__":
    main()
