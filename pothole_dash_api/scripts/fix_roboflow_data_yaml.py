"""Corrige data.yaml Roboflow — chemins absolus pour Ultralytics."""
from pathlib import Path

root = Path("data/yolo_import").resolve()
p = root / "data.yaml"
if not root.exists():
    raise SystemExit(f"Dossier introuvable: {root}")

# path = racine du dataset ; train/val relatifs à cette racine
p.write_text(
    f"""# Corrigé pour entraînement local (export Roboflow v17)
path: {root.as_posix()}
train: train/images
val: valid/images
test: test/images

nc: 5
names: ['Acceptable', 'Good', 'Poor', 'Very good', 'Very poor']
""",
    encoding="utf-8",
)
print("OK:", p)
print("  train ->", root / "train" / "images")
print("  val   ->", root / "valid" / "images")
