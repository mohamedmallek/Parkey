"""
Matériaux de réparation nid-de-poule (Tunisie) — sans budget.

- Priorité : analyse image Gemini (si quota disponible).
- Secours : barème ONSR basé sur taille / profondeur estimées par l'IA locale.
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple


def _gemini_api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip()


def _gemini_models() -> List[str]:
    primary = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-lite").strip()
    fallbacks = os.environ.get(
        "GEMINI_MODEL_FALLBACKS",
        "gemini-2.0-flash-lite,gemini-1.5-flash,gemini-1.5-flash-8b",
    )
    chain: List[str] = []
    for m in [primary, *fallbacks.split(",")]:
        m = m.strip()
        if m and m not in chain:
            chain.append(m)
    return chain


RULES_DISCLAIMER = (
    "Quantités indicatives (barème ONSR / dimensions IA) — à valider sur site "
    "par un technicien avant intervention."
)
GEMINI_DISCLAIMER = (
    "Quantités indicatives issues de l'analyse visuelle Gemini — à valider sur site "
    "par un technicien ONSR avant intervention."
)

DEPTH_MULTIPLIERS = {"FAIBLE": 1.0, "MOYENNE": 1.2, "PROFONDE": 1.5}

SIZE_PROFILES: Dict[str, Dict[str, Any]] = {
    "S": {
        "severity": "faible",
        "repair_type": "colmatage",
        "estimated_depth": "5–8 cm",
        "materials": [
            {"name": "Enrobé à froid", "quantity": 18, "unit": "kg", "role": "Colmatage du trou"},
            {"name": "Primaire d'accrochage", "quantity": 0.8, "unit": "L", "role": "Adhérence enrobé / chaussée"},
            {"name": "Agrégats calibrés 0/6", "quantity": 5, "unit": "kg", "role": "Complément si fond irrégulier"},
        ],
    },
    "M": {
        "severity": "modérée",
        "repair_type": "colmatage",
        "estimated_depth": "8–12 cm",
        "materials": [
            {"name": "Enrobé à froid", "quantity": 45, "unit": "kg", "role": "Remplissage principal"},
            {"name": "Primaire d'accrochage", "quantity": 1.5, "unit": "L", "role": "Adhérence"},
            {"name": "Agrégats calibrés 0/6", "quantity": 12, "unit": "kg", "role": "Reprofilage du fond"},
            {"name": "Émulsion bitumineuse", "quantity": 2, "unit": "L", "role": "Liant / imperméabilisation"},
        ],
    },
    "L": {
        "severity": "importante",
        "repair_type": "refection_partielle",
        "estimated_depth": "12–18 cm",
        "materials": [
            {"name": "Enrobé à froid", "quantity": 95, "unit": "kg", "role": "Couche de roulement"},
            {"name": "Primaire d'accrochage", "quantity": 3, "unit": "L", "role": "Adhérence"},
            {"name": "Agrégats calibrés 0/10", "quantity": 35, "unit": "kg", "role": "Couche de base"},
            {"name": "Émulsion bitumineuse", "quantity": 4, "unit": "L", "role": "Liant"},
            {"name": "Sable fin (filler)", "quantity": 8, "unit": "kg", "role": "Ajustement granulométrie"},
        ],
    },
    "XL": {
        "severity": "critique",
        "repair_type": "refection_profonde",
        "estimated_depth": "18–25 cm",
        "materials": [
            {"name": "Enrobé à froid", "quantity": 180, "unit": "kg", "role": "Couche de roulement"},
            {"name": "Primaire d'accrochage", "quantity": 5, "unit": "L", "role": "Adhérence"},
            {"name": "Agrégats calibrés 0/10", "quantity": 70, "unit": "kg", "role": "Couche de base"},
            {"name": "Grave bitume / GBS", "quantity": 120, "unit": "kg", "role": "Sous-couche si dégradation profonde"},
            {"name": "Émulsion bitumineuse", "quantity": 8, "unit": "L", "role": "Liant"},
        ],
    },
}

STANDARD_REPAIR_STEPS = [
    "Sécuriser la zone (signalisation, cônes)",
    "Découper les bords du nid-de-poule (bords verticaux)",
    "Nettoyer et sécher la cavité (air comprimé / balai)",
    "Appliquer le primaire d'accrochage",
    "Poser l'enrobé à froid par couches successives",
    "Compacter chaque couche (dame / plaque vibrante)",
    "Contrôler nivellement et adhérence",
]


def _resolve_size_class(meta: Dict[str, Any]) -> str:
    sc = str(meta.get("size_class") or "").upper()
    if sc in SIZE_PROFILES:
        return sc
    w = float(meta.get("width_cm_est") or 0)
    l = float(meta.get("length_cm_est") or 0)
    max_dim = max(w, l)
    if max_dim <= 0:
        return "M"
    if max_dim < 15:
        return "S"
    if max_dim < 30:
        return "M"
    if max_dim < 50:
        return "L"
    return "XL"


def _scale_quantity(qty: float, mul: float) -> float:
    v = qty * mul
    return round(v, 1) if v < 10 else round(v, 0)


def estimate_materials_rules(meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Barème matériaux ONSR (sans Gemini, sans prix)."""
    meta = meta or {}
    sc = _resolve_size_class(meta)
    profile = SIZE_PROFILES[sc]
    depth = str(meta.get("depth_proxy") or "MOYENNE").upper()
    depth_mul = DEPTH_MULTIPLIERS.get(depth, 1.15)

    w = float(meta.get("width_cm_est") or 0)
    l = float(meta.get("length_cm_est") or 0)
    area_mul = 1.0
    if w > 0 and l > 0:
        area_m2 = (w * l) / 10000.0
        ref = {"S": 0.02, "M": 0.06, "L": 0.15, "XL": 0.35}.get(sc, 0.06)
        area_mul = max(0.75, min(1.8, area_m2 / ref))

    mul = depth_mul * area_mul
    materials: List[Dict[str, Any]] = []
    for m in profile["materials"]:
        materials.append(
            {
                "name": m["name"],
                "quantity": _scale_quantity(float(m["quantity"]), mul),
                "unit": m["unit"],
                "role": m["role"],
            }
        )

    city = meta.get("city") or "Tunis"
    note = (
        f"Barème matériaux ONSR (classe {sc}, profondeur proxy {depth}, {city}). "
        f"Basé sur les dimensions estimées par l'IA locale."
    )

    return {
        "method": "rules_tunisia",
        "materials": materials,
        "repair_steps": list(STANDARD_REPAIR_STEPS),
        "pothole_assessment": {
            "severity": profile["severity"],
            "repair_type": profile["repair_type"],
            "estimated_depth": profile["estimated_depth"],
        },
        "note": note,
        "confidence": "moyenne",
        "disclaimer": RULES_DISCLAIMER,
        "gemini_available": bool(_gemini_api_key()),
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


def _normalize_materials(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("materiau") or "").strip()
        if not name:
            continue
        qty = item.get("quantity")
        if qty is None:
            qty = item.get("quantite")
        unit = str(item.get("unit") or item.get("unite") or "").strip()
        role = str(item.get("role") or item.get("usage") or item.get("purpose") or "").strip()
        entry: Dict[str, Any] = {"name": name, "quantity": qty, "unit": unit}
        if role:
            entry["role"] = role
        out.append(entry)
    return out


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "quota" in msg or "rate limit" in msg or "resource_exhausted" in msg


def _friendly_gemini_error(exc: Exception) -> str:
    if _is_quota_error(exc):
        return (
            "Quota Gemini épuisé (gratuit). Barème ONSR utilisé à la place. "
            "Réessayez plus tard ou activez la facturation sur Google AI Studio."
        )
    return f"Gemini indisponible : {str(exc)[:200]}"


def _build_gemini_prompt(meta: Dict[str, Any]) -> str:
    return f"""Tu es un ingénieur routier expert en maintenance voirie en TUNISIE (ONSR).
Analyse la photo de route / nid-de-poule et détermine les MATÉRIAUX nécessaires pour une réparation DURABLE.

IMPORTANT :
- NE DONNE AUCUN PRIX, AUCUN BUDGET, AUCUN MONTANT EN DINARS (TND).
- Liste uniquement les matériaux avec quantités estimées.

Contexte détection IA :
- Label : {meta.get('label', 'potholes')}
- Confiance : {meta.get('prob', '?')}
- Classe taille : {meta.get('size_class', '?')} ({meta.get('width_cm_est')} × {meta.get('length_cm_est')} cm)
- Profondeur proxy : {meta.get('depth_proxy', '?')}
- Ville : {meta.get('city', 'Tunis')}

Réponds UNIQUEMENT avec un JSON valide (pas de markdown) :
{{
  "materials": [
    {{"name": "nom", "quantity": number, "unit": "kg|L|m³|sacs", "role": "rôle"}}
  ],
  "repair_steps": ["étape 1", "..."],
  "pothole_assessment": {{
    "severity": "faible|modérée|importante|critique",
    "repair_type": "colmatage|refection_partielle|refection_profonde",
    "estimated_depth": "description courte"
  }},
  "note": "justification courte en français",
  "confidence": "haute|moyenne|faible"
}}"""


def _call_gemini(image_bytes: bytes, meta: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    import google.generativeai as genai

    genai.configure(api_key=_gemini_api_key())
    prompt = _build_gemini_prompt(meta)
    mime = "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    image_part = {"mime_type": mime, "data": base64.b64encode(image_bytes).decode("ascii")}

    last_err: Optional[str] = None
    for model_name in _gemini_models():
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content([prompt, image_part])
            raw = response.text if response and response.text else ""
            parsed = _parse_gemini_json(raw)
            if not parsed or not parsed.get("materials"):
                last_err = f"Réponse invalide ({model_name})"
                continue

            materials = _normalize_materials(parsed.get("materials"))
            steps = parsed.get("repair_steps") if isinstance(parsed.get("repair_steps"), list) else []
            steps = [str(s).strip() for s in steps if str(s).strip()]
            assessment = parsed.get("pothole_assessment")
            if not isinstance(assessment, dict):
                assessment = {}

            return (
                {
                    "method": "gemini",
                    "materials": materials,
                    "repair_steps": steps or list(STANDARD_REPAIR_STEPS),
                    "pothole_assessment": assessment,
                    "note": parsed.get("note") or f"Analyse Gemini ({model_name}).",
                    "confidence": parsed.get("confidence"),
                    "disclaimer": GEMINI_DISCLAIMER,
                    "gemini_available": True,
                    "gemini_model": model_name,
                },
                None,
            )
        except Exception as exc:
            last_err = str(exc)
            if _is_quota_error(exc):
                time.sleep(1)
            continue
    return None, last_err


def analyze_repair_materials(image_bytes: bytes, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Gemini si possible, sinon barème ONSR (toujours des matériaux si taille connue)."""
    meta = meta or {}
    rules = estimate_materials_rules(meta)

    if not _gemini_api_key():
        return rules

    gemini_result, gemini_err = _call_gemini(image_bytes, meta)
    if gemini_result:
        return gemini_result

    fallback = {**rules, "method": "rules_fallback"}
    fallback["gemini_error"] = _friendly_gemini_error(Exception(gemini_err or "inconnu"))
    fallback["note"] = (
        f"{fallback['note']} {fallback['gemini_error']}"
    )
    fallback["gemini_quota_exceeded"] = _is_quota_error(Exception(gemini_err or ""))
    return fallback


def _apply_analysis_to_event(event: Dict[str, Any], analysis: Dict[str, Any]) -> None:
    if analysis.get("materials"):
        event["repair_materials"] = analysis["materials"]
        event["repair_steps"] = analysis.get("repair_steps") or []
        event["repair_note"] = analysis.get("note")
        event["repair_confidence"] = analysis.get("confidence")
        event["repair_method"] = analysis.get("method")
        event["repair_assessment"] = analysis.get("pothole_assessment")
        event["repair_disclaimer"] = analysis.get("disclaimer")
    if analysis.get("gemini_error"):
        event["repair_materials_warning"] = analysis["gemini_error"]
    if analysis.get("error"):
        event["repair_materials_error"] = analysis["error"]


def enrich_event_repair_materials(event: Dict[str, Any], image_bytes: bytes) -> Dict[str, Any]:
    model = event.get("model") or ""
    label = str(event.get("label") or "").lower()
    if model != "pothole" and "pothole" not in label:
        return event
    if not event.get("alert") and label != "potholes":
        return event

    analysis = analyze_repair_materials(
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
    _apply_analysis_to_event(event, analysis)
    event["repair_analysis"] = analysis
    return event
