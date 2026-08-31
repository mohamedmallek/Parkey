"""Détection YOLO : panneaux endommagés + boîtes englobantes dans l'image."""

from __future__ import annotations

import io
from typing import List, Tuple

from PIL import Image

_yolo_cache: dict = {}

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


def get_yolo(model_path: str):
    if model_path not in _yolo_cache:
        try:
            from ultralytics import YOLO
        except ImportError as e:
            raise ImportError("pip install ultralytics") from e
        _yolo_cache[model_path] = YOLO(model_path)
    return _yolo_cache[model_path]


def detect_bytes(
    model_path: str,
    image_bytes: bytes,
    conf: float = 0.35,
    iou: float = 0.45,
) -> Tuple[List[dict], int, int]:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size
    import numpy as np

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
            detections.append(
                {
                    "label": label,
                    "conf": score,
                    "bbox_norm": {
                        "x1": round(x1 / w, 5),
                        "y1": round(y1 / h, 5),
                        "x2": round(x2 / w, 5),
                        "y2": round(y2 / h, 5),
                    },
                    "bbox_px": {
                        "x1": round(x1, 1),
                        "y1": round(y1, 1),
                        "x2": round(x2, 1),
                        "y2": round(y2, 1),
                    },
                    "center_norm": {
                        "x": round((x1 + x2) / (2 * w), 5),
                        "y": round((y1 + y2) / (2 * h), 5),
                    },
                }
            )

    return detections, w, h
