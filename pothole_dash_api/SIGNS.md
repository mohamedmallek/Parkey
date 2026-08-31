# Signalétique routière — guide pas à pas

Ce guide ajoute un **2ᵉ modèle IA** (classification de panneaux) à côté du modèle nids-de-poule, avec le **même pipeline** ResNet18 + Flask + Angular.

## Datasets Kaggle recommandés

| Dataset | Lien | Classes | Usage |
|--------|------|---------|--------|
| **GTSRB** (recommandé) | [gtsrb-german-traffic-sign](https://www.kaggle.com/datasets/meowmeowmeowmeowmeow/gtsrb-german-traffic-sign) | 43 | Classification — **identique** à `train.py` |
| Traffic Sign Classification | [traffic-sign-dataset-classification](https://www.kaggle.com/datasets/ahemateja19bec1025/traffic-sign-dataset-classification) | ~43 | Classification simple |
| **GTSDB** | [gtsdb](https://www.kaggle.com/datasets/safabouguezzi/german-traffic-sign-detection-benchmark-gtsdb) | bbox | **Détection** (YOLO) — autre projet |

Pour commencer vite **sans compte Kaggle**, utilisez l’option torchvision (étape 2A).

---

## Étape 1 — Prérequis

```powershell
cd C:\Users\DELL\pothole_dash_api
.venv\Scripts\activate
pip install -r requirements.txt
```

---

## Étape 2A — Dataset via torchvision (GTSRB, sans Kaggle)

```powershell
python prepare_signs_dataset.py --source torchvision
```

Cela crée `data/signs/train/` et `data/signs/val/` (~39k images train).

Test rapide (moins d’images) :

```powershell
python prepare_signs_dataset.py --source torchvision --max_per_class 300
```

---

## Étape 2B — Dataset depuis Kaggle (optionnel)

1. Créez un compte sur [kaggle.com](https://www.kaggle.com/).
2. **Account → Settings → API** → créez `kaggle.json`.
3. Placez `kaggle.json` dans `%USERPROFILE%\.kaggle\`.
4. Téléchargez un dataset, par exemple GTSRB :

```powershell
pip install kaggle
kaggle datasets download -d meowmeowmeowmeowmeow/gtsrb-german-traffic-sign -p data/kaggle_download
Expand-Archive data/kaggle_download/*.zip -DestinationPath data/kaggle_signs
```

5. Préparez train/val :

```powershell
python prepare_signs_dataset.py --source kaggle_folder --kaggle_src data/kaggle_signs
```

Adaptez `--kaggle_src` si les dossiers sont ailleurs (ex. `data/kaggle_signs/Train`).

---

## Étape 3 — Entraîner le modèle signalétique

```powershell
python train.py --data_dir data/signs --epochs 10 --batch_size 32 --img_size 224 --out_model models/signs_model.pt --out_labels models/signs_labels.json
```

Sur CPU, comptez **plusieurs heures** pour le dataset complet ; utilisez `--max_per_class` à l’étape 2 pour un premier test.

---

## Étape 4 — Démarrer l’API

```powershell
python api.py
```

Vérifier les modèles :

```powershell
curl http://127.0.0.1:5000/models
```

Prédiction panneau :

```powershell
curl -F "image=@chemin/vers/panneau.jpg" -F "model=signs" http://127.0.0.1:5000/predict
```

Variables d’environnement optionnelles :

- `SIGNS_MODEL_PATH` — chemin du `.pt` signalétique (défaut: `models/signs_model.pt`)
- `DEFAULT_MODEL_ID` — `pothole` ou `signs`

---

## Étape 5 — Frontend Angular

1. `ng serve` (déjà configuré avec proxy vers Flask).
2. Dans le dashboard, choisissez **Signalétique (panneaux)** dans la liste **Modèle IA**.
3. Uploadez une image → **Predict**.

---

## Étape 6 — Interprétation des résultats

- **Nids-de-poule** : alerte ONSR si label `potholes` et probabilité ≥ seuil.
- **Signalétique** : alerte si probabilité ≥ seuil (panneau reconnu avec confiance). Les classes GTSRB sont nommées `class_00` … `class_42` (IDs du benchmark).

Pour des noms lisibles (Stop, Limit 50…), ajoutez un fichier `models/signs_class_names.json` et mappez les IDs — voir [GTSRB meta](https://benchmark.ini.rub.de/).

---

## Dépannage

| Problème | Solution |
|----------|----------|
| `Model not found` pour `signs` | Finir étapes 2 + 3 |
| Kaggle 403 | Accepter les règles du dataset sur le site Kaggle |
| Mémoire GPU/CPU | `--batch_size 16`, `--max_per_class 200` |
| Vidéo | Pour l’instant, analyse vidéo = modèle `pothole` uniquement |
