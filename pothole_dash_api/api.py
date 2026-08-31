import os
import json
import time
import uuid
from pathlib import Path


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_local_env()

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from app.inference import predict_bytes
from app.model_registry import MODEL_REGISTRY, compute_alert, get_loaded, get_model_meta, list_models
from app.video_analyzer import (
    analyze_video_combined,
    analyze_video_file,
    analyze_video_signs_yolo,
)
from app.yolo_detection import detect_bytes, is_damaged_label
from app.pothole_sizing import enrich_pothole_event
from app.repair_materials import analyze_repair_materials, enrich_event_repair_materials


MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join("models", "model.pt"))
DEFAULT_MODEL_ID = os.environ.get("DEFAULT_MODEL_ID", "pothole")
EVENTS_PATH = os.environ.get("EVENTS_PATH", os.path.join("data", "events.jsonl"))
FRAMES_DIR = os.environ.get("FRAMES_DIR", os.path.join("data", "frames"))
MAX_EVENTS = int(os.environ.get("MAX_EVENTS", "2000"))
DEFAULT_ALERT_THRESHOLD = float(os.environ.get("ALERT_THRESHOLD", "0.8"))

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
events = []


def _resolve_model_id() -> str:
    model_id = (request.form.get("model") or request.args.get("model") or DEFAULT_MODEL_ID).strip()
    if model_id not in MODEL_REGISTRY:
        return DEFAULT_MODEL_ID
    return model_id


def _now_ms() -> int:
    return int(time.time() * 1000)


def _safe_float(v):
    try:
        if v is None:
            return None
        s = str(v).strip()
        if s == "":
            return None
        return float(s)
    except Exception:
        return None


def _save_event_frame(event_id: str, img_bytes: bytes) -> str:
    out = Path(FRAMES_DIR)
    out.mkdir(parents=True, exist_ok=True)
    frame_path = (out / f"{event_id}.jpg").as_posix()
    Path(frame_path).write_bytes(img_bytes)
    return frame_path


def _append_event(evt: dict):
    global events
    events.append(evt)
    if len(events) > MAX_EVENTS:
        events = events[-MAX_EVENTS:]

    p = Path(EVENTS_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(evt, ensure_ascii=False) + "\n")


def _save_uploaded_video(tmp_dir: Path) -> str:
    if "video" not in request.files:
        raise ValueError("Missing file field 'video' (multipart/form-data)")
    f = request.files["video"]
    data = f.read()
    if not data:
        raise ValueError("Empty video file")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    vid_id = str(uuid.uuid4())
    # keep simple .mp4; opencv detects by content in most cases
    path = (tmp_dir / f"{vid_id}.mp4")
    path.write_bytes(data)
    return path.as_posix()


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/models")
def models_list():
    return jsonify({"models": list_models(), "default": DEFAULT_MODEL_ID})


def _predict_meta_from_request():
    threshold = _safe_float(request.form.get("threshold"))
    if threshold is None:
        threshold = DEFAULT_ALERT_THRESHOLD
    threshold = float(max(0.0, min(1.0, threshold)))
    return {
        "threshold": threshold,
        "lat": _safe_float(request.form.get("lat")),
        "lon": _safe_float(request.form.get("lon")),
        "speed_kmh": _safe_float(request.form.get("speed_kmh")),
        "source": request.form.get("source") or "manual",
        "city": (request.form.get("city") or "").strip() or None,
        "zone": (request.form.get("zone") or "").strip() or None,
    }


@app.post("/predict")
def predict():
    model_id = _resolve_model_id()
    try:
        meta = get_model_meta(model_id)
    except KeyError:
        return jsonify({"error": f"Unknown model '{model_id}'. Use GET /models"}), 400

    if "image" not in request.files:
        return jsonify({"error": "Missing file field 'image' (multipart/form-data)"}), 400

    f = request.files["image"]
    img_bytes = f.read()
    if not img_bytes:
        return jsonify({"error": "Empty image file"}), 400

    fname = (getattr(f, "filename", None) or "").lower()
    if fname.endswith((".mp4", ".avi", ".mov", ".mkv", ".webm")):
        return jsonify(
            {
                "error": "Fichier vidéo reçu. Utilisez POST /video/analyze pour les vidéos, "
                "ou envoyez une image JPG/PNG pour /predict."
            }
        ), 400

    common = _predict_meta_from_request()
    threshold = common["threshold"]

    if meta.get("kind") == "yolo":
        return _predict_signs_damage(model_id, meta, f, img_bytes, common, threshold)

    try:
        loaded = get_loaded(model_id)
    except FileNotFoundError as e:
        return jsonify({"error": f"Model not found at {e}. Train first: python train.py"}), 400

    label, prob, top = predict_bytes(loaded, img_bytes, topk=5)

    evt = {
        "id": str(uuid.uuid4()),
        "ts_ms": _now_ms(),
        "model": model_id,
        "task": meta["task"],
        "filename": getattr(f, "filename", None),
        "label": label,
        "prob": float(prob),
        "topk": top,
        "lat": common["lat"],
        "lon": common["lon"],
        "speed_kmh": common["speed_kmh"],
        "source": common["source"],
        "city": common["city"],
        "zone": common["zone"],
        "threshold": threshold,
    }
    evt["alert"] = compute_alert(model_id, label, float(prob), threshold)
    evt["frame_path"] = _save_event_frame(evt["id"], img_bytes)
    if model_id == "pothole" and label == meta.get("alert_label", "potholes"):
        enrich_pothole_event(evt, img_bytes)
    if evt.get("alert") and model_id == "pothole":
        enrich_event_repair_materials(evt, img_bytes)
    _append_event(evt)

    resp = {
            "model": model_id,
            "model_title": meta["title"],
            "kind": "classifier",
            "label": label,
            "prob": prob,
            "topk": top,
            "classes": loaded.classes,
            "event": evt,
        }
    if evt.get("size_class"):
        resp["size_estimate"] = {
            "size_class": evt["size_class"],
            "width_cm_est": evt["width_cm_est"],
            "length_cm_est": evt["length_cm_est"],
            "max_dim_cm_est": evt.get("max_dim_cm_est"),
            "depth_proxy": evt["depth_proxy"],
            "depth_score": evt["depth_score"],
            "calibration": evt.get("size_calibration"),
            "bbox_norm": evt.get("bbox_norm"),
        }
    if evt.get("repair_analysis"):
        resp["repair_analysis"] = evt["repair_analysis"]
    return jsonify(resp)


def _predict_signs_damage(model_id, meta, f, img_bytes, common, threshold):
    path = meta["path"]
    if not os.path.exists(path):
        return jsonify(
            {
                "error": f"Model not found at {path}. See SIGNS_DAMAGE.md: "
                "prepare_signs_damage_yolo.py + train_signs_damage_yolo.py"
            }
        ), 400

    try:
        raw_dets, img_w, img_h = detect_bytes(path, img_bytes, conf=threshold)
    except ImportError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        err_name = type(e).__name__
        if "UnidentifiedImageError" in err_name or "cannot identify image" in str(e).lower():
            return jsonify(
                {
                    "error": "Format non reconnu. Envoyez une image JPG ou PNG (pas de vidéo MP4)."
                }
            ), 400
        return jsonify({"error": f"Détection échouée: {e}"}), 500

    lat, lon = common["lat"], common["lon"]
    gps_ok = lat is not None and lon is not None

    detections = []
    events = []
    for d in raw_dets:
        damaged = is_damaged_label(d["label"])
        if not damaged:
            continue
        if float(d["conf"]) < threshold:
            continue

        street = {
            "lat": lat,
            "lon": lon,
            "source": "gps" if gps_ok else None,
            "note": None
            if gps_ok
            else "Activez le GPS pour la position dans la rue (latitude/longitude).",
        }
        det = {
            **d,
            "street": street,
            "alert": True,
        }
        detections.append(det)

        evt = {
            "id": str(uuid.uuid4()),
            "ts_ms": _now_ms(),
            "model": model_id,
            "task": meta["task"],
            "filename": getattr(f, "filename", None),
            "label": d["label"],
            "prob": float(d["conf"]),
            "topk": [{"label": d["label"], "prob": float(d["conf"])}],
            "bbox_norm": d["bbox_norm"],
            "bbox_px": d["bbox_px"],
            "center_norm": d["center_norm"],
            "lat": lat,
            "lon": lon,
            "speed_kmh": common["speed_kmh"],
            "source": common["source"],
            "city": common["city"],
            "zone": common["zone"],
            "threshold": threshold,
            "alert": True,
        }
        evt["frame_path"] = _save_event_frame(evt["id"], img_bytes)
        _append_event(evt)
        events.append(evt)

    best_label = detections[0]["label"] if detections else "none"
    best_prob = detections[0]["conf"] if detections else 0.0

    return jsonify(
        {
            "model": model_id,
            "model_title": meta["title"],
            "kind": "yolo",
            "label": best_label,
            "prob": best_prob,
            "topk": [{"label": x["label"], "prob": x["conf"]} for x in detections[:5]],
            "classes": [],
            "detections": detections,
            "detection_count": len(detections),
            "image": {"width": img_w, "height": img_h},
            "gps": {"lat": lat, "lon": lon, "available": gps_ok},
            "events": events,
            "event": events[0] if events else None,
        }
    )


def _findings_to_events(findings, source, threshold, city, zone, fallback_lat, fallback_lon):
    created = []
    for f in findings:
        evt = {
            "id": f.id,
            "ts_ms": _now_ms(),
            "model": f.model,
            "task": f.model,
            "source": source,
            "video_ts_ms": f.ts_ms,
            "frame_idx": f.frame_idx,
            "label": f.label,
            "prob": f.prob,
            "topk": f.topk,
            "threshold": float(threshold),
            "alert": True,
            "city": city,
            "zone": zone,
            "lat": f.lat if f.lat is not None else fallback_lat,
            "lon": f.lon if f.lon is not None else fallback_lon,
            "ocr_text": f.ocr_text,
            "frame_path": f.frame_path,
            "detection_count": getattr(f, "detection_count", 1),
        }
        if f.model == "pothole" and f.frame_path and os.path.exists(f.frame_path):
            try:
                img_bytes = Path(f.frame_path).read_bytes()
                enrich_pothole_event(evt, img_bytes)
                enrich_event_repair_materials(evt, img_bytes)
            except Exception:
                pass
        _append_event(evt)
        created.append(evt)
    return created


@app.post("/video/analyze")
def analyze_video():
    """
    Analyse vidéo : model=pothole | signs_damage | both
    Sauvegarde les frames où une alerte est détectée (photos dans data/frames).
    """
    model_id = (request.form.get("model") or request.args.get("model") or "both").strip()
    if model_id not in MODEL_REGISTRY and model_id != "both":
        model_id = "both"

    sample_fps = _safe_float(request.form.get("sample_fps")) or 1.0
    threshold = _safe_float(request.form.get("threshold")) or DEFAULT_ALERT_THRESHOLD
    max_frames_raw = request.form.get("max_frames")
    try:
        max_frames = int(max_frames_raw) if max_frames_raw not in (None, "") else 0
    except Exception:
        max_frames = 0
    # 0 = pas de plafond (toute la vidéo selon sample_fps) ; sinon 10 … 50000
    if max_frames > 0:
        max_frames = max(10, min(max_frames, 50000))

    city = (request.form.get("city") or "").strip() or None
    zone = (request.form.get("zone") or "").strip() or None
    source = request.form.get("source") or "video"
    fallback_lat = _safe_float(request.form.get("lat"))
    fallback_lon = _safe_float(request.form.get("lon"))
    ocr_flag = (request.form.get("ocr_enabled") or "true").strip().lower()
    ocr_enabled = ocr_flag not in ("0", "false", "no", "off")

    try:
        video_path = _save_uploaded_video(Path("data") / "tmp_videos")
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    all_findings = []
    errors = []
    video_meta = {}

    run_pothole = model_id in ("pothole", "both")
    run_signs = model_id in ("signs_damage", "both")
    signs_path = MODEL_REGISTRY["signs_damage"]["path"] if run_signs else None
    if run_signs and not os.path.exists(signs_path):
        errors.append(f"signs_damage: modèle introuvable ({signs_path})")
        if model_id == "signs_damage":
            return jsonify({"error": errors[0]}), 400
        run_signs = False

    signs_threshold = float(max(0.25, threshold * 0.85))

    try:
        if run_pothole and run_signs:
            loaded = get_loaded("pothole")
            all_findings, video_meta = analyze_video_combined(
                pothole_loaded=loaded,
                signs_model_path=signs_path if run_signs else None,
                video_path=video_path,
                out_dir=FRAMES_DIR,
                sample_fps=float(sample_fps),
                pothole_threshold=float(threshold),
                signs_threshold=signs_threshold,
                max_frames=max_frames,
                ocr_enabled=ocr_enabled,
            )
        elif run_pothole:
            loaded = get_loaded("pothole")
            all_findings = analyze_video_file(
                loaded=loaded,
                video_path=video_path,
                out_dir=FRAMES_DIR,
                sample_fps=float(sample_fps),
                threshold=float(threshold),
                max_frames=max_frames,
                ocr_enabled=ocr_enabled,
            )
        elif run_signs:
            all_findings = analyze_video_signs_yolo(
                model_path=signs_path,
                video_path=video_path,
                out_dir=FRAMES_DIR,
                sample_fps=float(sample_fps),
                threshold=signs_threshold,
                max_frames=max_frames,
                ocr_enabled=ocr_enabled,
            )
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Analyse vidéo interrompue: {e}"}), 500

    if not all_findings and errors:
        return jsonify({"error": " ; ".join(errors)}), 400

    created = _findings_to_events(
        all_findings, source, threshold, city, zone, fallback_lat, fallback_lon
    )

    pothole_n = sum(1 for e in created if e.get("model") == "pothole")
    signs_n = sum(1 for e in created if e.get("model") == "signs_damage")

    dur = video_meta.get("duration_sec", 0)
    analyzed = video_meta.get("frames_analyzed", 0)
    est = video_meta.get("estimated_samples", analyzed)
    note = None
    if dur > 0:
        mins = int(dur // 60)
        secs = int(dur % 60)
        mode = "vidéo entière (FPS)" if max_frames == 0 else f"max {max_frames} images"
        note = (
            f"Durée {mins}:{secs:02d} — {analyzed} images analysées ({mode}, échantillon ~{est}). "
            f"Patience : une vidéo longue peut prendre 10–60 min sur CPU."
        )

    return jsonify(
        {
            "count": len(created),
            "events": created,
            "summary": {"pothole": pothole_n, "signs_damage": signs_n},
            "video_meta": {**(video_meta or {}), "max_frames_used": max_frames, "sample_fps": sample_fps},
            "note": note,
            "warnings": errors if errors else None,
        }
    )


@app.get("/materials/status")
def materials_status():
    from app.repair_materials import _gemini_api_key

    key = _gemini_api_key()
    return jsonify(
        {
            "gemini_configured": bool(key),
            "gemini_model": os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
            "analysis_type": "repair_materials",
        }
    )


def _resolve_event_image(event_id: str):
    img_bytes = None
    if event_id:
        for e in reversed(events):
            if e.get("id") == event_id:
                fp = e.get("frame_path")
                if fp and os.path.exists(fp):
                    img_bytes = Path(fp).read_bytes()
                break
        if img_bytes is None:
            direct = Path(FRAMES_DIR) / f"{event_id}.jpg"
            if direct.exists():
                img_bytes = direct.read_bytes()
    return img_bytes


@app.post("/materials/analyze")
def materials_analyze():
    """
    Analyse Gemini : matériaux + quantités pour réparer le nid-de-poule (sans budget).
    multipart: image (optionnel si event_id) + meta ou event_id.
    """
    event_id = (request.form.get("event_id") or "").strip()
    img_bytes = None

    if "image" in request.files and request.files["image"].filename:
        img_bytes = request.files["image"].read()
    elif event_id:
        img_bytes = _resolve_event_image(event_id)
    if not img_bytes:
        return jsonify({"error": "Image ou event_id avec capture requis"}), 400

    meta = {
        "label": request.form.get("label"),
        "prob": _safe_float(request.form.get("prob")),
        "size_class": request.form.get("size_class"),
        "width_cm_est": _safe_float(request.form.get("width_cm_est")),
        "length_cm_est": _safe_float(request.form.get("length_cm_est")),
        "depth_proxy": request.form.get("depth_proxy"),
        "city": request.form.get("city") or "Tunis",
        "zone": request.form.get("zone"),
    }
    if event_id and not meta.get("size_class"):
        for e in reversed(events):
            if e.get("id") == event_id:
                meta.update(
                    {
                        "label": e.get("label"),
                        "prob": e.get("prob"),
                        "size_class": e.get("size_class"),
                        "width_cm_est": e.get("width_cm_est"),
                        "length_cm_est": e.get("length_cm_est"),
                        "depth_proxy": e.get("depth_proxy"),
                        "city": e.get("city"),
                        "zone": e.get("zone"),
                    }
                )
                break

    analysis = analyze_repair_materials(img_bytes, meta)
    if not analysis.get("materials"):
        err = analysis.get("error") or analysis.get("gemini_error") or "Analyse matériaux impossible"
        return jsonify({"error": err, "repair_analysis": analysis}), 503
    return jsonify({"repair_analysis": analysis})


@app.get("/budget/status")
def budget_status():
    return materials_status()


@app.post("/budget/estimate")
def budget_estimate():
    """Alias legacy → materials/analyze."""
    return materials_analyze()


@app.get("/events/frame/<event_id>")
def get_event_frame(event_id: str):
    for e in reversed(events):
        if e.get("id") == event_id and e.get("frame_path"):
            p = e["frame_path"]
            if os.path.exists(p):
                return send_file(p, mimetype="image/jpeg")
    direct = Path(FRAMES_DIR) / f"{event_id}.jpg"
    if direct.exists():
        return send_file(direct, mimetype="image/jpeg")
    return jsonify({"error": "frame not found"}), 404


@app.delete("/events/<event_id>")
def delete_event(event_id: str):
    _delete_event_ids([event_id])
    return jsonify({"ok": True, "deleted": 1})


@app.post("/events/delete-batch")
def delete_events_batch():
    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or []
    if not isinstance(ids, list):
        return jsonify({"error": "ids must be a list"}), 400
    cleaned = [str(x) for x in ids if x]
    removed = _delete_event_ids(cleaned)
    return jsonify({"ok": True, "deleted": removed})


def _delete_event_ids(ids: list) -> int:
    global events
    wanted = {str(i) for i in ids if i}
    if not wanted:
        return 0
    before = len(events)
    events = [e for e in events if str(e.get("id")) not in wanted]
    for event_id in wanted:
        direct = Path(FRAMES_DIR) / f"{event_id}.jpg"
        try:
            if direct.exists():
                direct.unlink()
        except OSError:
            pass
    return before - len(events)


@app.get("/events")
def list_events():
    limit = request.args.get("limit", default="200")
    try:
        limit_n = max(1, min(int(limit), 5000))
    except Exception:
        limit_n = 200
    return jsonify({"events": list(reversed(events[-limit_n:]))})


@app.get("/events/export.json")
def export_events_json():
    return jsonify({"events": events})


@app.get("/events/export.csv")
def export_events_csv():
    import csv
    import io
    from flask import Response

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "ts_ms",
            "filename",
            "model",
            "label",
            "prob",
            "alert",
            "threshold",
            "lat",
            "lon",
            "speed_kmh",
            "city",
            "zone",
            "source",
        ]
    )
    for e in events:
        writer.writerow(
            [
                e.get("id"),
                e.get("ts_ms"),
                e.get("model"),
                e.get("filename"),
                e.get("label"),
                e.get("prob"),
                e.get("alert"),
                e.get("threshold"),
                e.get("lat"),
                e.get("lon"),
                e.get("speed_kmh"),
                e.get("city"),
                e.get("zone"),
                e.get("source"),
            ]
        )
    return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=events.csv"})


if __name__ == "__main__":
    # Windows-friendly dev server
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)

