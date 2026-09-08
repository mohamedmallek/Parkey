"""Détection YOLO : panneaux endommagés + boîtes englobantes dans l'image."""

from __future__ import annotations

import io
import os
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image

_yolo_cache: dict = {}

YOLO_DETECT_CONF = float(os.environ.get("SIGNS_DETECT_CONF", "0.35"))
SIGNS_MIN_CONF = float(os.environ.get("SIGNS_MIN_CONF", "0.45"))

DAMAGED_LABEL_KEYWORDS = (
    "damaged",
    "damage",
    "casse",
    "cassé",
    "broken",
    "vandal",
    "graffiti",
    "defect",
    "degraded",
    "worn",
    "fallen",
    "downed",
    "tilted",
    "leaning",
    "knocked",
    "displaced",
    "bent",
)


def is_damaged_label(label: str) -> bool:
    """Roboflow clari: Poor, Very poor = endommagé ; Good, Very good = OK."""
    n = label.lower().replace("-", "_").replace(" ", "_")
    if n in ("sign_ok", "ok", "intact", "normal", "good", "very_good", "verygood"):
        return False
    if n in ("poor", "very_poor", "verypoor") or "poor" in n:
        return True
    if n == "acceptable":
        return False
    return any(k in n for k in DAMAGED_LABEL_KEYWORDS)


def is_fallen_bbox(bbox_norm: dict) -> bool:
    """Un panneau à terre est souvent plus large que haut, dans la moitié basse."""
    try:
        x1, y1, x2, y2 = (float(bbox_norm[k]) for k in ("x1", "y1", "x2", "y2"))
    except (KeyError, TypeError, ValueError):
        return False
    bw, bh = max(1e-6, x2 - x1), max(1e-6, y2 - y1)
    aspect = bw / bh
    cy = (y1 + y2) / 2.0
    if aspect >= 1.55:
        return True
    if aspect >= 1.28 and cy >= 0.42:
        return True
    return False


def looks_like_sign_label(label: str) -> bool:
    n = label.lower().replace("-", "_").replace(" ", "_")
    if is_damaged_label(n):
        return True
    if n in ("sign_ok", "ok", "intact", "normal", "good", "very_good", "verygood", "acceptable"):
        return True
    return any(k in n for k in ("sign", "panneau", "traffic", "board"))


def looks_damaged(det: dict) -> bool:
    label = str(det.get("label") or "")
    if is_damaged_label(label):
        return True
    return looks_like_sign_label(label) and is_fallen_bbox(det.get("bbox_norm") or {})


def get_yolo(model_path: str):
    if model_path not in _yolo_cache:
        try:
            from ultralytics import YOLO
        except ImportError as e:
            raise ImportError("pip install ultralytics") from e
        _yolo_cache[model_path] = YOLO(model_path)
    return _yolo_cache[model_path]


def _box_payload(x1: float, y1: float, x2: float, y2: float, w: int, h: int, label: str, conf: float) -> dict:
    width = max(1.0, float(w))
    height = max(1.0, float(h))
    left = float(x1)
    top = float(y1)
    right = float(x2)
    bottom = float(y2)
    return {
        "label": str(label),
        "conf": float(conf),
        "bbox_norm": {
            "x1": float(round(max(0.0, left / width), 5)),
            "y1": float(round(max(0.0, top / height), 5)),
            "x2": float(round(min(1.0, right / width), 5)),
            "y2": float(round(min(1.0, bottom / height), 5)),
        },
        "bbox_px": {
            "x1": float(round(left, 1)),
            "y1": float(round(top, 1)),
            "x2": float(round(right, 1)),
            "y2": float(round(bottom, 1)),
        },
        "center_norm": {
            "x": float(round((left + right) / (2.0 * width), 5)),
            "y": float(round((top + bottom) / (2.0 * height), 5)),
        },
    }


def detect_bytes(
    model_path: str,
    image_bytes: bytes,
    conf: float = 0.35,
    iou: float = 0.45,
) -> Tuple[List[dict], int, int]:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size
    arr = np.array(img)
    model = get_yolo(model_path)
    results = model.predict(arr, conf=conf, iou=iou, verbose=False)

    detections: List[dict] = []
    for r in results:
        names = r.names or {}
        if r.boxes is None:
            continue
        for box in r.boxes:
            cls_id = int(box.cls[0])
            label = str(names.get(cls_id, cls_id))
            score = float(box.conf[0])
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            detections.append(_box_payload(x1, y1, x2, y2, w, h, label, score))

    return detections, w, h


def detect_damaged_signs(
    model_path: str,
    image_bytes: bytes,
    detect_conf: Optional[float] = None,
    min_conf: Optional[float] = None,
) -> Tuple[List[dict], int, int]:
    """YOLO uniquement : Poor / Very poor / panneau à terre. Pas de secours couleur."""
    conf = YOLO_DETECT_CONF if detect_conf is None else float(detect_conf)
    conf = max(0.05, min(0.6, conf))
    keep = SIGNS_MIN_CONF if min_conf is None else float(min_conf)

    raw, w, h = detect_bytes(model_path, image_bytes, conf=conf)
    damaged: List[dict] = []
    for det in raw:
        if float(det["conf"]) < keep:
            continue
        if not looks_damaged(det):
            continue
        if is_fallen_bbox(det["bbox_norm"]) and not is_damaged_label(det["label"]):
            det = {**det, "label": "fallen_sign"}
        damaged.append(det)

    if damaged:
        damaged.sort(key=lambda d: float(d["conf"]), reverse=True)
        return damaged, w, h
    return [], w, h
