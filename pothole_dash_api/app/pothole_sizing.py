"""
Estimation approximative de la taille d'un nid-de-poule à partir de la bbox
et d'une calibration route (largeur de voie de référence).

Méthode documentée pour PFE :
- Calibration : voie standard 3,5 m visible sur ~85 % de la largeur image (dashcam).
- Localisation : contour sombre dans la zone route (partie basse de l'image) si pas de bbox YOLO.
- Marge d'erreur typique : ±40 % (pas de LiDAR / pas d'échelle métrique directe).
"""
from __future__ import annotations

import io
import os
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

LANE_WIDTH_M = float(os.environ.get("POTHOLE_LANE_WIDTH_M", "3.5"))
ROAD_WIDTH_FRACTION = float(os.environ.get("POTHOLE_ROAD_WIDTH_FRACTION", "0.85"))
ROAD_Y_START = float(os.environ.get("POTHOLE_ROAD_Y_START", "0.35"))
ERROR_MARGIN_PCT = int(os.environ.get("POTHOLE_SIZE_MARGIN_PCT", "40"))

SIZE_THRESHOLDS_CM = {
    "S": 15.0,
    "M": 30.0,
    "L": 50.0,
}


def _norm_bbox(x1: float, y1: float, x2: float, y2: float, w: int, h: int) -> Dict[str, float]:
    return {
        "x1": max(0.0, min(1.0, x1 / w)),
        "y1": max(0.0, min(1.0, y1 / h)),
        "x2": max(0.0, min(1.0, x2 / w)),
        "y2": max(0.0, min(1.0, y2 / h)),
    }


def _detect_pothole_bbox_heuristic(bgr: np.ndarray) -> Tuple[Optional[Dict[str, int]], str]:
    """Trouve une région sombre type nid-de-poule dans la zone route."""
    h, w = bgr.shape[:2]
    y0 = int(h * ROAD_Y_START)
    roi = bgr[y0:h, :]
    if roi.size == 0:
        return None, "fallback_center"

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (7, 7), 0)
    # Nids-de-poule = zones plus sombres que l'asphalte environnant
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    roi_area = roi.shape[0] * roi.shape[1]
    best = None
    best_score = 0.0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < roi_area * 0.002 or area > roi_area * 0.35:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        aspect = bw / max(bh, 1)
        if aspect < 0.25 or aspect > 4.0:
            continue
        # Favoriser le bas-centre (zone de roulement)
        cx = x + bw / 2
        cy = y + bh / 2 + y0
        center_score = 1.0 - abs(cx - w / 2) / (w / 2)
        bottom_score = cy / h
        score = area * (0.5 + 0.3 * center_score + 0.2 * bottom_score)
        if score > best_score:
            best_score = score
            best = (x, y + y0, x + bw, y + bh)

    if best is None:
        # Fallback : zone centrale-basse typique (~18 % de l'image)
        bw = int(w * 0.18)
        bh = int(h * 0.12)
        cx, cy = w // 2, int(h * 0.72)
        x1 = max(0, cx - bw // 2)
        y1 = max(y0, cy - bh // 2)
        x2 = min(w, x1 + bw)
        y2 = min(h, y1 + bh)
        return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}, "fallback_center"

    x1, y1, x2, y2 = best
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}, "contour_heuristic"


def _depth_proxy(bgr: np.ndarray, bbox_px: Dict[str, int]) -> Tuple[str, float]:
    """Score de profondeur indirect (contraste sombre dans la bbox)."""
    x1, y1, x2, y2 = bbox_px["x1"], bbox_px["y1"], bbox_px["x2"], bbox_px["y2"]
    h, w = bgr.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return "MOYENNE", 0.5

    patch = bgr[y1:y2, x1:x2]
    if patch.size == 0:
        return "MOYENNE", 0.5

    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    pothole_mean = float(np.mean(gray))

    pad = max(4, int((y2 - y1) * 0.3))
    sy1 = max(0, y1 - pad)
    sy2 = min(h, y2 + pad)
    sx1 = max(0, x1 - pad)
    sx2 = min(w, x2 + pad)
    surround = bgr[sy1:sy2, sx1:sx2].copy()
    surround[y1 - sy1 : y2 - sy1, x1 - sx1 : x2 - sx1] = 0
    sur_gray = cv2.cvtColor(surround, cv2.COLOR_BGR2GRAY)
    mask = sur_gray > 0
    if not np.any(mask):
        road_mean = float(np.mean(cv2.cvtColor(bgr[y1:y2, :], cv2.COLOR_BGR2GRAY)))
    else:
        road_mean = float(np.mean(sur_gray[mask]))

    contrast = max(0.0, min(1.0, (road_mean - pothole_mean) / 80.0))
    if contrast >= 0.55:
        return "PROFONDE", round(contrast, 3)
    if contrast >= 0.3:
        return "MOYENNE", round(contrast, 3)
    return "FAIBLE", round(contrast, 3)


def _size_class(max_dim_cm: float) -> str:
    if max_dim_cm < SIZE_THRESHOLDS_CM["S"]:
        return "S"
    if max_dim_cm < SIZE_THRESHOLDS_CM["M"]:
        return "M"
    if max_dim_cm < SIZE_THRESHOLDS_CM["L"]:
        return "L"
    return "XL"


def estimate_pothole_size(
    image_bytes: bytes,
    bbox_norm: Optional[Dict[str, float]] = None,
    bbox_px: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """
    Estime largeur/longueur (cm), classe S/M/L/XL et proxy de profondeur.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    h, w = bgr.shape[:2]
    method = "existing_bbox"

    if bbox_px and all(k in bbox_px for k in ("x1", "y1", "x2", "y2")):
        box = {k: int(bbox_px[k]) for k in ("x1", "y1", "x2", "y2")}
    elif bbox_norm and all(k in bbox_norm for k in ("x1", "y1", "x2", "y2")):
        box = {
            "x1": int(bbox_norm["x1"] * w),
            "y1": int(bbox_norm["y1"] * h),
            "x2": int(bbox_norm["x2"] * w),
            "y2": int(bbox_norm["y2"] * h),
        }
    else:
        detected, method = _detect_pothole_bbox_heuristic(bgr)
        box = detected or {"x1": w // 4, "y1": int(h * 0.6), "x2": 3 * w // 4, "y2": int(h * 0.85)}

    bw = max(1, box["x2"] - box["x1"])
    bh = max(1, box["y2"] - box["y1"])

    # ppm au niveau de la bbox (réf. route en bas de image)
    road_y = int(h * 0.92)
    ppm = (w * ROAD_WIDTH_FRACTION) / LANE_WIDTH_M

    width_cm = (bw / ppm) * 100.0
    length_cm = (bh / ppm) * 100.0
    max_dim = max(width_cm, length_cm)
    size_class = _size_class(max_dim)
    depth_proxy, depth_score = _depth_proxy(bgr, box)

    return {
        "bbox_px": box,
        "bbox_norm": _norm_bbox(box["x1"], box["y1"], box["x2"], box["y2"], w, h),
        "width_cm_est": round(width_cm, 1),
        "length_cm_est": round(length_cm, 1),
        "max_dim_cm_est": round(max_dim, 1),
        "size_class": size_class,
        "depth_proxy": depth_proxy,
        "depth_score": depth_score,
        "calibration": {
            "lane_width_m": LANE_WIDTH_M,
            "road_width_fraction": ROAD_WIDTH_FRACTION,
            "ppm_at_reference": round(ppm, 2),
            "method": method,
            "margin_pct": ERROR_MARGIN_PCT,
            "note": (
                f"Estimation visuelle ±{ERROR_MARGIN_PCT} % — calibration voie {LANE_WIDTH_M} m, "
                "sans LiDAR. Classe S<15 cm, M<30, L<50, XL≥50."
            ),
        },
    }


def enrich_pothole_event(event: Dict[str, Any], image_bytes: bytes) -> Dict[str, Any]:
    """Ajoute les champs de taille à un événement nid-de-poule."""
    model = event.get("model") or ""
    label = str(event.get("label") or "")
    is_pothole = model == "pothole" or label.lower() in ("potholes", "pothole")
    if not is_pothole:
        return event

    est = estimate_pothole_size(
        image_bytes,
        bbox_norm=event.get("bbox_norm"),
        bbox_px=event.get("bbox_px"),
    )
    if not event.get("bbox_norm"):
        event["bbox_norm"] = est["bbox_norm"]
        event["bbox_px"] = est["bbox_px"]
    event["width_cm_est"] = est["width_cm_est"]
    event["length_cm_est"] = est["length_cm_est"]
    event["max_dim_cm_est"] = est["max_dim_cm_est"]
    event["size_class"] = est["size_class"]
    event["depth_proxy"] = est["depth_proxy"]
    event["depth_score"] = est["depth_score"]
    event["size_calibration"] = est["calibration"]
    return event
