# Estimation budget réparation (Tunisie)

## Fonctionnement

À chaque détection **nid-de-poule** (alerte), le système estime un budget en **TND** :

1. **Barème ONSR (toujours actif)** — classes S/M/L/XL, profondeur proxy, ville
2. **Google Gemini (optionnel)** — analyse l'image + contexte pour affiner l'estimation

## Activer Gemini

1. Créez une clé API : https://aistudio.google.com/apikey

2. Avant de lancer Flask :

```powershell
# PowerShell
$env:GEMINI_API_KEY = "votre-cle-api"
$env:GEMINI_MODEL = "gemini-2.0-flash"   # optionnel
python api.py
```

3. Installez la dépendance (une fois) :

```powershell
pip install google-generativeai
```

Sans clé Gemini, seul le **barème Tunisie** est utilisé (suffisant pour la soutenance).

## API

- `GET /budget/status` — Gemini configuré ou non
- `POST /budget/estimate` — multipart : `image` ou `event_id` + meta (city, size_class, …)

## Barème indicatif (TND)

| Classe | Fourchette |
|--------|------------|
| S (< 15 cm) | 75 – 190 |
| M (15–30 cm) | 190 – 480 |
| L (30–50 cm) | 480 – 1 050 |
| XL (≥ 50 cm) | 1 050 – 2 400 |

Majorations : profondeur proxy, zone urbaine (Tunis, Ariana…).

**Disclaimer** : ordre de grandeur PFE — ne remplace pas un devis officiel ONSR.
