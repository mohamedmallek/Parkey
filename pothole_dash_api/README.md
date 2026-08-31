# Pothole model + Flask API + Dash dashboard

Ce projet entraîne un modèle de **classification d'images** (transfer learning) et expose:
- une **API Flask** `POST /predict` qui prend une image et renvoie la prédiction
- un **dashboard Dash** pour uploader une image et visualiser le résultat

## 1) Installation

Créer un environnement puis installer:

```bash
cd pothole_dash_api
python -m venv .venv
.venv\\Scripts\\activate
pip install -U pip
pip install -r requirements.txt
```

## 2) Dataset (structure attendue)

Le code supporte deux structures:

### Option A (recommandée): `data/train` et `data/val`

```
data/
  train/
    classA/
      *.jpg
    classB/
      *.jpg
  val/
    classA/
      *.jpg
    classB/
      *.jpg
```

### Option B: un seul dossier `data/raw/<class>`

```
data/
  raw/
    classA/
      *.jpg
    classB/
      *.jpg
```

Dans ce cas, lance un split automatique:

```bash
python split_data.py --raw_dir data/raw --out_dir data --val_ratio 0.2
```

## 3) Entraîner

```bash
python train.py --data_dir data --epochs 8 --batch_size 32 --img_size 224
```

Le modèle est sauvegardé dans `models/model.pt` et un fichier `models/labels.json`.

## 4) Démarrer l'API

```bash
python api.py
```

Test rapide:

```bash
python -c "import requests; r=requests.post('http://127.0.0.1:5000/predict', files={'image': open('some.jpg','rb')}); print(r.json())"
```

## 5) Démarrer le dashboard

Dans un autre terminal:

```bash
python dashboard.py
```

Ouvre `http://127.0.0.1:8050`.

## 6) Signalétique cassée (détection + GPS rue)

- **Pas d’images ?** → **[OBTENIR_IMAGES.md](./OBTENIR_IMAGES.md)** (Roboflow, Kaggle, Hugging Face)
- Entraînement / API : **[SIGNS_DAMAGE.md](./SIGNS_DAMAGE.md)**

```bash
pip install ultralytics
python prepare_signs_damage_yolo.py --mode folders
python train_signs_damage_yolo.py
python api.py
```

Angular : modèle **Signalétique cassée** + **Use GPS** pour la position dans la rue.

