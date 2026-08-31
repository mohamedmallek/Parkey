import os
from typing import Dict

from app.inference import LoadedModel, load_model

MODEL_REGISTRY: Dict[str, dict] = {
    "pothole": {
        "path": os.environ.get("MODEL_PATH", os.path.join("models", "model.pt")),
        "title": "Nids-de-poule",
        "kind": "classifier",
        "alert_label": "potholes",
        "task": "pothole",
    },
    "signs_damage": {
        "path": os.environ.get(
            "SIGNS_DAMAGE_MODEL_PATH",
            os.path.join("models", "signs_damage_yolo.pt"),
        ),
        "title": "Signalétique cassée (détection)",
        "kind": "yolo",
        "task": "signs_damage",
    },
}

_loaded: Dict[str, LoadedModel] = {}


def list_models() -> list[dict]:
    out = []
    for model_id, meta in MODEL_REGISTRY.items():
        path = meta["path"]
        out.append(
            {
                "id": model_id,
                "title": meta["title"],
                "task": meta["task"],
                "kind": meta.get("kind", "classifier"),
                "ready": os.path.exists(path),
                "path": path,
            }
        )
    return out


def get_model_meta(model_id: str) -> dict:
    if model_id not in MODEL_REGISTRY:
        raise KeyError(f"Unknown model id: {model_id}")
    return MODEL_REGISTRY[model_id]


def get_loaded(model_id: str) -> LoadedModel:
    meta = get_model_meta(model_id)
    if meta.get("kind") == "yolo":
        raise TypeError(f"Model {model_id} is YOLO; use yolo detection API")

    if model_id not in _loaded:
        path = meta["path"]
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        _loaded[model_id] = load_model(path)

    return _loaded[model_id]


def compute_alert(model_id: str, label: str, prob: float, threshold: float) -> bool:
    meta = MODEL_REGISTRY[model_id]
    alert_label = meta.get("alert_label")
    if alert_label:
        return bool(label == alert_label and float(prob) >= threshold)
    return bool(float(prob) >= threshold)
