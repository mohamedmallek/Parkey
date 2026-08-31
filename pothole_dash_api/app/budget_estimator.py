"""
Estimation du budget de réparation de nids-de-poule en Tunisie (TND).

- Mode règles : barème ONSR basé sur taille estimée, profondeur proxy et ville.
- Mode Gemini (optionnel) : analyse image + contexte si GEMINI_API_KEY est défini.
"""
from __future__ import annotations

import base64
import json
import os
import re
from typing import Any, Dict, List, Optional

def _gemini_api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip()


GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

# Barème indicatif réparation voirie Tunisie (TND) — PFE / ordre de grandeur 2024-2025
SIZE_RATES_TND: Dict[str, Dict[str, Any]] = {
    "S": {
        "min": 75,
        "max": 190,
        "label": "Petit colmatage (enrobé à froid, main d'œuvre locale)",
    },
    "M": {
        "min": 190,
        "max": 480,
        "label": "Réparation standard (decoupe légère + enrobé + compactage)",
    },
    "L": {
        "min": 480,
        "max": 1050,
        "label": "Réparation profonde (decoupe, base, enrobé)",
    },
    "XL": {
        "min": 1050,
        "max": 2400,
        "label": "Réfection étendue (surface importante, possible sous-couche)",
    },
}

# Majoration zone urbaine dense / autoroute
CITY_MULTIPLIERS: Dict[str, float] = {
    "tunis": 1.12,
    "ariana": 1.08,
    "ben arous": 1.06,
    "sfax": 1.05,
    "sousse": 1.05,
}

DEPTH_MULTIPLIERS = {
    "FAIBLE": 1.0,
    "MOYENNE": 1.15,
    "PROFONDE": 1.28,
}


def _round_tnd(v: float) -> float:
    return round(v, 0)


def estimate_budget_rules(
    size_class: Optional[str] = None,
    width_cm: Optional[float] = None,
    length_cm: Optional[float] = None,
    depth_proxy: Optional[str] = None,
    city: Optional[str] = None,
    prob: Optional[float] = None,
) -> Dict[str, Any]:
    sc = (size_class or "M").upper()
    if sc not in SIZE_RATES_TND:
        # Déduire depuis dimensions si disponibles
        max_dim = max(width_cm or 0, length_cm or 0)
        if max_dim <= 0:
            sc = "M"
        elif max_dim < 15:
            sc = "S"
        elif max_dim < 30:
            sc = "M"
        elif max_dim < 50:
            sc = "L"
        else:
            sc = "XL"

    base = SIZE_RATES_TND[sc]
    city_key = (city or "").strip().lower()
    city_mul = CITY_MULTIPLIERS.get(city_key, 1.0)
    depth_mul = DEPTH_MULTIPLIERS.get((depth_proxy or "MOYENNE").upper(), 1.1)

    # Surface approximative (cm² → m²) pour poste matériaux
    w = width_cm or 20
    l = length_cm or 20
    area_m2 = max(0.02, (w * l) / 10000.0)
    materials_tnd = area_m2 * 180  # ~180 TND/m² enrobé posé (ordre de grandeur)

    min_tnd = base["min"] * city_mul * depth_mul
    max_tnd = base["max"] * city_mul * depth_mul
    mid_tnd = (min_tnd + max_tnd) / 2

    breakdown: List[Dict[str, Any]] = [
        {"poste": "Type intervention", "detail": base["label"], "montant_tnd": _round_tnd(mid_tnd * 0.55)},
        {"poste": "Matériaux (enrobé, liant)", "detail": f"~{area_m2:.2f} m²", "montant_tnd": _round_tnd(materials_tnd)},
        {"poste": "Main d'œuvre + équipement", "detail": "Équipe 2-3 agents", "montant_tnd": _round_tnd(mid_tnd * 0.35)},
    ]
    if city_mul > 1.0:
        breakdown.append(
            {
                "poste": "Majoration zone",
                "detail": city or "Urbain",
                "montant_tnd": _round_tnd(mid_tnd * (city_mul - 1)),
            }
        )

    note = (
        f"Estimation indicative Tunisie (barème ONSR PFE). Classe {sc}, "
        f"profondeur proxy {depth_proxy or 'MOYENNE'}. "
        f"Fourchette ±25 % selon entreprise, trafic et accès chantier. TVA non incluse."
    )
    if prob is not None and prob < 0.7:
        note += " Confiance IA modérée — budget à valider sur site."

    return {
        "currency": "TND",
        "min_tnd": _round_tnd(min_tnd),
        "max_tnd": _round_tnd(max_tnd),
        "mid_tnd": _round_tnd(mid_tnd),
        "size_class_used": sc,
        "method": "rules_tunisia",
        "breakdown": breakdown,
        "note": note,
        "disclaimer": "Ordre de grandeur — ne remplace pas un devis officiel ONSR / entreprise.",
    }


def _parse_gemini_json(text: str) -> Optional[Dict[str, Any]]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def estimate_budget_gemini(image_bytes: bytes, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not _gemini_api_key():
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=_gemini_api_key())
        model = genai.GenerativeModel(GEMINI_MODEL)

        rules = context.get("rules_estimate") or {}
        prompt = f"""Tu es un ingénieur routier expert en maintenance voirie en TUNISIE (ONSR).
Analyse la photo de route/nid-de-poule et estime un budget de RÉPARATION en dinars tunisiens (TND).

Contexte détection IA:
- Label: {context.get('label', 'potholes')}
- Confiance: {context.get('prob', '?')}
- Taille estimée: {context.get('size_class', '?')} ({context.get('width_cm_est')} x {context.get('length_cm_est')} cm)
- Profondeur proxy: {context.get('depth_proxy', '?')}
- Ville: {context.get('city', 'Tunis')}
- Estimation barème local: {rules.get('min_tnd')}-{rules.get('max_tnd')} TND

Réponds UNIQUEMENT avec un JSON valide (pas de markdown):
{{
  "min_tnd": number,
  "max_tnd": number,
  "mid_tnd": number,
  "currency": "TND",
  "breakdown": [{{"poste": "...", "detail": "...", "montant_tnd": number}}],
  "note": "courte justification en français",
  "confidence": "haute|moyenne|faible"
}}
Utilise des prix réalistes pour la Tunisie (2024-2025)."""

        image_part = {"mime_type": "image/jpeg", "data": base64.b64encode(image_bytes).decode("ascii")}
        # Detect mime from magic bytes
        if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
            image_part["mime_type"] = "image/png"

        response = model.generate_content([prompt, image_part])
        raw = response.text if response and response.text else ""
        parsed = _parse_gemini_json(raw)
        if not parsed or "min_tnd" not in parsed:
            return None

        return {
            "currency": "TND",
            "min_tnd": _round_tnd(float(parsed["min_tnd"])),
            "max_tnd": _round_tnd(float(parsed.get("max_tnd", parsed["min_tnd"]))),
            "mid_tnd": _round_tnd(
                float(parsed.get("mid_tnd", (float(parsed["min_tnd"]) + float(parsed.get("max_tnd", parsed["min_tnd"]))) / 2))
            ),
            "breakdown": parsed.get("breakdown") or [],
            "note": parsed.get("note") or "Estimation Gemini (contexte Tunisie)",
            "gemini_confidence": parsed.get("confidence"),
            "method": "gemini",
            "disclaimer": "Estimation IA Gemini — à valider par un expert ONSR.",
        }
    except Exception:
        return None


def estimate_pothole_budget(image_bytes: bytes, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Estimation hybride : Gemini si disponible, sinon barème Tunisie."""
    meta = meta or {}
    rules = estimate_budget_rules(
        size_class=meta.get("size_class"),
        width_cm=meta.get("width_cm_est"),
        length_cm=meta.get("length_cm_est"),
        depth_proxy=meta.get("depth_proxy"),
        city=meta.get("city"),
        prob=meta.get("prob"),
    )

    ctx = {**meta, "rules_estimate": rules}
    gemini = estimate_budget_gemini(image_bytes, ctx)

    if gemini:
        # Fusion prudente : min = max(règles.min, gemini.min*0.85), max = moyenne des deux max
        blended_min = _round_tnd(min(rules["min_tnd"], gemini["min_tnd"] * 0.9))
        blended_max = _round_tnd(max(rules["max_tnd"], gemini["max_tnd"]))
        blended_mid = _round_tnd((blended_min + blended_max) / 2)
        return {
            "currency": "TND",
            "min_tnd": blended_min,
            "max_tnd": blended_max,
            "mid_tnd": blended_mid,
            "method": "gemini_hybrid",
            "breakdown": gemini.get("breakdown") or rules["breakdown"],
            "note": gemini.get("note") + f" (recoupe avec barème ONSR {rules['min_tnd']}-{rules['max_tnd']} TND)",
            "disclaimer": rules["disclaimer"],
            "rules_reference": rules,
            "gemini_estimate": gemini,
            "gemini_available": True,
        }

    return {
        **rules,
        "gemini_available": bool(_gemini_api_key()),
        "gemini_used": False,
    }


def enrich_event_budget(event: Dict[str, Any], image_bytes: bytes) -> Dict[str, Any]:
    model = event.get("model") or ""
    label = str(event.get("label") or "").lower()
    if model != "pothole" and "pothole" not in label:
        return event
    if not event.get("alert") and label != "potholes":
        return event

    budget = estimate_pothole_budget(
        image_bytes,
        {
            "label": event.get("label"),
            "prob": event.get("prob"),
            "size_class": event.get("size_class"),
            "width_cm_est": event.get("width_cm_est"),
            "length_cm_est": event.get("length_cm_est"),
            "depth_proxy": event.get("depth_proxy"),
            "city": event.get("city"),
            "zone": event.get("zone"),
        },
    )
    event["budget_min_tnd"] = budget.get("min_tnd")
    event["budget_max_tnd"] = budget.get("max_tnd")
    event["budget_mid_tnd"] = budget.get("mid_tnd")
    event["budget_currency"] = budget.get("currency", "TND")
    event["budget_method"] = budget.get("method")
    event["budget_note"] = budget.get("note")
    event["budget_breakdown"] = budget.get("breakdown")
    event["budget_disclaimer"] = budget.get("disclaimer")
    event["budget_estimate"] = budget
    return event
