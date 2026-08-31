# Analyse matériaux réparation (Gemini)

## Fonctionnement

À chaque détection **nid-de-poule** (alerte), Gemini analyse la photo et estime :

- **Quels matériaux** sont nécessaires (enrobé, bitume, agrégats, primaire, etc.)
- **Quelles quantités** (kg, L, m³, sacs…)
- **Les étapes** de réparation recommandées

**Pas de budget ni de prix en TND** — uniquement matériaux et quantités.

## Activer Gemini

1. Clé API : https://aistudio.google.com/apikey
2. Fichier `.env` dans `pothole_dash_api` :

```
GEMINI_API_KEY=votre-cle
GEMINI_MODEL=gemini-2.0-flash
```

3. Dépendance :

```powershell
pip install google-generativeai
python api.py
```

## API Flask

- `GET /materials/status` — Gemini configuré ou non
- `POST /materials/analyze` — multipart : `image` ou `event_id` + meta (city, size_class, …)

## Exemple de réponse

```json
{
  "repair_analysis": {
    "method": "gemini",
    "materials": [
      {"name": "Enrobé à froid", "quantity": 45, "unit": "kg", "role": "Colmatage"},
      {"name": "Primaire d'accrochage", "quantity": 2, "unit": "L", "role": "Adhérence"}
    ],
    "repair_steps": ["Sécuriser la zone", "Nettoyer le trou", "..."],
    "confidence": "moyenne"
  }
}
```

**Disclaimer** : quantités indicatives PFE — validation sur site par un technicien ONSR.
