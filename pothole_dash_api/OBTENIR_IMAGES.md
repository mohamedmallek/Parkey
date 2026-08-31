# Où télécharger des photos — signalétique cassée

Vous n’avez pas besoin de prendre les photos vous‑même. Voici **3 sources gratuites** adaptées au projet, puis les **étapes exactes** sous Windows.

---

## Option A — Roboflow (recommandé, prêt pour YOLO)

Idéal : images **+ cadres** (bbox) déjà annotés → meilleur pour « où dans l’image ».

### Datasets utiles

| Nom | Lien | Contenu |
|-----|------|---------|
| **Level damage of traffic sign** | https://universe.roboflow.com/clari/level-damage-of-traffig-sign | Panneaux : Good / Acceptable / Poor |
| **Road signs (Roboflow 100)** | https://universe.roboflow.com/roboflow-100/road-signs-6ih4y | Panneaux routiers (détection) |
| Recherche | https://universe.roboflow.com → chercher `damaged road sign` | Plusieurs jeux publics |

### Téléchargement (5 min)

1. Ouvrir le lien du dataset (ex. **level-damage-of-traffig-sign**).
2. Cliquer **Sign Up** / **Log In** (compte gratuit Roboflow).
3. Cliquer **Download Dataset**.
4. Choisir le format **YOLOv8** (ou YOLOv11).
5. Télécharger le fichier `.zip`.

### Intégration dans votre projet

```powershell
cd C:\Users\DELL\pothole_dash_api

# Extraire le zip Roboflow ici (structure images/train, labels/train, etc.)
Expand-Archive -Path "$env:USERPROFILE\Downloads\level-damage-of-traffig-sign*.zip" -DestinationPath data\yolo_import -Force

python prepare_signs_damage_yolo.py --mode yolo_import --import_dir data\yolo_import
python train_signs_damage_yolo.py --epochs 40
```

Si le zip a un sous-dossier (ex. `train/`), ajustez :

```powershell
python prepare_signs_damage_yolo.py --mode yolo_import --import_dir data\yolo_import\NomDuDossierDansLeZip
```

---

## Option B — Kaggle (archive ZIP)

### Datasets à chercher sur https://www.kaggle.com/datasets

- `damaged traffic signs`
- `road sign damage`
- `gtsrb` (panneaux normaux — moins « cassé » mais utilisable en secours)

Exemple de recherche :  
https://www.kaggle.com/search?q=damaged+traffic+sign+in%3Adatasets

### Téléchargement avec Kaggle CLI

1. Compte Kaggle → **Account** → **Create New API Token** → fichier `kaggle.json`.
2. Placer `kaggle.json` dans : `C:\Users\DELL\.kaggle\kaggle.json`

```powershell
python -m pip install kaggle
cd C:\Users\DELL\pothole_dash_api

# Remplacer SLUG par le dataset choisi (page Kaggle → URL)
kaggle datasets download -d <auteur>/<slug> -p data\kaggle_download
Expand-Archive data\kaggle_download\*.zip -DestinationPath data\kaggle_signs -Force
```

### Si les images sont par dossiers (sans bbox)

Organisez ou copiez ainsi :

```
data\signs_damage_raw\sign_damaged\   ← panneaux abîmés
data\signs_damage_raw\sign_ok\        ← panneaux OK (optionnel)
```

Puis :

```powershell
python prepare_signs_damage_yolo.py --mode folders
python train_signs_damage_yolo.py --epochs 40
```

---

## Option C — Hugging Face (Road Issues)

Dataset multi-problèmes routiers dont **panneaux cassés / vandalisés** :

https://huggingface.co/datasets/Programmer-RD-AI/road-issues-detection-dataset

```powershell
python -m pip install datasets huggingface_hub
```

Script rapide (à lancer une fois) — enregistre des images dans `sign_damaged` :

```powershell
cd C:\Users\DELL\pothole_dash_api
python scripts\download_hf_sign_issues.py --max_images 200
python prepare_signs_damage_yolo.py --mode folders
python train_signs_damage_yolo.py --epochs 40
```

(Voir script `scripts/download_hf_sign_issues.py` si présent.)

---

## Après l’entraînement — utiliser l’app

1. Vérifier le fichier : `models\signs_damage_yolo.pt`
2. Démarrer l’API :

```powershell
python api.py
```

3. Angular (`ng serve`) → modèle **Signalétique cassée (détection)**
4. **Use GPS** → upload photo → **Predict**
5. Cadres rouges sur l’image + **Google Maps** pour la position dans la rue

---

## Dépannage rapide

| Problème | Solution |
|----------|----------|
| `images\val` manquant | Relancer `prepare_signs_damage_yolo.py` après avoir mis des images |
| Dossier vide | Au moins **10 images** dans `sign_damaged` ou zip Roboflow complet |
| `pip` introuvable | `python -m pip install ultralytics` |
| Modèle grisé dans Angular | Entraînement pas fini ou `signs_damage_yolo.pt` absent |

---

## Résumé du parcours le plus simple

```
Roboflow (YOLOv8 zip)
    → data\yolo_import\
    → prepare_signs_damage_yolo.py --mode yolo_import
    → train_signs_damage_yolo.py
    → models\signs_damage_yolo.pt
    → python api.py + Angular
```
