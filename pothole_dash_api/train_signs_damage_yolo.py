"""
Entraîne YOLOv8 pour détecter la signalétique cassée (bbox + classe).

Prérequis:
  python prepare_signs_damage_yolo.py --mode folders
  pip install ultralytics

Usage:
  python train_signs_damage_yolo.py --epochs 40
"""

import argparse
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/signs_damage_yolo/data.yaml")
    parser.add_argument("--base", default="yolov8n.pt", help="yolov8n.pt | yolov8s.pt")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--out", default="models/signs_damage_yolo.pt")
    args = parser.parse_args()

    data_yaml = Path(args.data)
    if not data_yaml.exists():
        raise SystemExit(
            f"{data_yaml} introuvable.\n"
            "Roboflow extrait: python scripts/fix_roboflow_data_yaml.py\n"
            "  puis python train_signs_damage_yolo.py --data data/yolo_import/data.yaml"
        )

    # Export Roboflow direct (data/yolo_import) — chemins relatifs au dossier du yaml
    if "yolo_import" in data_yaml.as_posix() and data_yaml.parent.name == "yolo_import":
        fix_script = Path("scripts/fix_roboflow_data_yaml.py")
        if fix_script.exists():
            import subprocess
            subprocess.run(["python", str(fix_script)], check=False, cwd=Path.cwd())

    from ultralytics import YOLO

    model = YOLO(args.base)
    results = model.train(
        data=str(data_yaml.resolve()),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project="runs/signs_damage",
        name="train",
        exist_ok=True,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    if not best.exists():
        best = Path("runs/signs_damage/train/weights/best.pt")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, out)
    print("Modèle exporté:", out.resolve())


if __name__ == "__main__":
    main()
