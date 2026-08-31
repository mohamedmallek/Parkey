# Signalétique cassée — détection + position dans la rue

Ce modèle répond à deux besoins :

1. **Où dans la photo ?** → boîte englobante (YOLO) autour du panneau endommagé  
2. **Où dans la rue ?** → latitude / longitude GPS au moment de la prise de vue (bouton **Use GPS** dans Angular)

> Le GPS indique la position du **téléphone / véhicule**, pas le panneau au mètre près. Pour une précision infra, il faudrait une carte + triangulation ou des bbox calibrées — hors scope MVP.

---

## Datasets recommandés (avec vraies bbox)

| Source | Type | Lien |
|--------|------|------|
| Roboflow « Damaged Road Signs » | YOLO bbox | [universe.roboflow.com](https://universe.roboflow.com) → chercher *damaged road signs* |
| Road Issues (Hugging Face) | images + catégories | [road-issues-detection-dataset](https://huggingface.co/datasets/Programmer-RD-AI/road-issues-detection-dataset) |
| Données locales ONSR | photos Tunisie | `data/signs_damage_raw/sign_damaged/` |

Export Roboflow en **YOLOv8**, puis :

```powershell
python prepare_signs_damage_yolo.py --mode yolo_import --import_dir data/yolo_import
```

---

## Entraînement rapide (dossiers sans bbox)

Si vous n’avez que des photos entières de panneaux cassés :

```
data/signs_damage_raw/
  sign_damaged/   ← panneaux abîmés
  sign_ok/        ← optionnel
```

```powershell
cd C:\Users\DELL\pothole_dash_api

# Pas de .venv ? Utilisez python -m pip (pas besoin de "pip" seul)
python -m pip install ultralytics

# IMPORTANT: copiez des photos AVANT prepare (sinon dataset vide)
# data\signs_damage_raw\sign_damaged\*.jpg  (minimum ~10 images)

python prepare_signs_damage_yolo.py --mode folders
python train_signs_damage_yolo.py --epochs 40
```

Fichier produit : `models/signs_damage_yolo.pt`

---

## API

```powershell
python api.py
```

```powershell
curl -F "image=@panneau.jpg" -F "model=signs_damage" -F "lat=36.8065" -F "lon=10.1815" http://127.0.0.1:5000/predict
```

Réponse (extrait) :

```json
{
  "model": "signs_damage",
  "detections": [
    {
      "label": "sign_damaged",
      "conf": 0.91,
      "bbox_norm": { "x1": 0.12, "y1": 0.08, "x2": 0.45, "y2": 0.52 },
      "street": { "lat": 36.8065, "lon": 10.1815, "source": "gps" }
    }
  ],
  "image": { "width": 1920, "height": 1080 }
}
```

---

## Angular

1. Modèle **Signalétique cassée (détection)**  
2. **Use GPS** avant Predict  
3. Cadres rouges sur l’image + bouton **Google Maps** par panneau détecté
