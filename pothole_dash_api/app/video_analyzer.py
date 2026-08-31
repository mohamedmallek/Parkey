import io
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import easyocr
import numpy as np
from PIL import Image

from app.inference import LoadedModel, predict_bytes
from app.ocr_coords import parse_lat_lon
from app.yolo_detection import detect_bytes, is_damaged_label


@dataclass(frozen=True)
class VideoFinding:
    id: str
    frame_idx: int
    ts_ms: int
    label: str
    prob: float
    topk: List[dict]
    ocr_text: Optional[str]
    lat: Optional[float]
    lon: Optional[float]
    frame_path: str
    model: str = "pothole"
    detection_count: int = 1


def _encode_jpg_bgr(frame_bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ok:
        raise ValueError("Failed to encode JPG")
    return bytes(buf.tobytes())


def _video_sampling(cap: cv2.VideoCapture, sample_fps: float, max_frames: int) -> Tuple[float, int, int, float, int]:
    """
    Calcule le pas entre frames.
    max_frames=0 → toute la vidéo est parcourue selon sample_fps uniquement (aucune limite artificielle).
    max_frames>0 → plafond du nombre d'images analysées (répartition uniforme).
    """
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 0:
        fps = 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_sec = (total / fps) if total > 0 else 0.0

    step_fps = max(1, int(round(fps / max(sample_fps, 0.05))))
    if total > 0 and max_frames and max_frames > 0:
        step_cap = max(1, total // max_frames)
        step = max(step_fps, step_cap)
    else:
        step = step_fps

    est = (total // step) if total > 0 else int(duration_sec * sample_fps)
    return fps, total, step, duration_sec, est


def _ocr_coords(reader, frame_bgr: np.ndarray) -> Tuple[Optional[str], Optional[float], Optional[float]]:
    if reader is None:
        return None, None, None
    roi = _default_ocr_roi(frame_bgr)
    roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
    result = reader.readtext(roi_rgb, detail=0)
    ocr_text = " ".join([str(x) for x in result]) if result else None
    ll = parse_lat_lon(ocr_text or "")
    if ll:
        return ocr_text, ll[0], ll[1]
    return ocr_text, None, None


def _default_ocr_roi(frame_bgr: np.ndarray) -> np.ndarray:
    """
    Default OCR region: bottom 25% of the frame (common for GPS overlays).
    Adjust later if your video has coords elsewhere.
    """
    h, w = frame_bgr.shape[:2]
    y0 = int(h * 0.75)
    return frame_bgr[y0:h, 0:w]


def analyze_video_file(
    loaded: LoadedModel,
    video_path: str,
    out_dir: str,
    sample_fps: float = 2.0,
    threshold: float = 0.8,
    target_label: str = "potholes",
    ocr_enabled: bool = True,
    max_frames: int = 120,
) -> List[VideoFinding]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps, _total, step, _dur, _est = _video_sampling(cap, sample_fps, max_frames)

    reader = None
    if ocr_enabled:
        reader = easyocr.Reader(["en"], gpu=False)

    findings: List[VideoFinding] = []
    frame_idx = -1
    analyzed = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_idx += 1
        if frame_idx % step != 0:
            continue
        analyzed += 1

        jpg_bytes = _encode_jpg_bgr(frame)
        label, prob, topk = predict_bytes(loaded, jpg_bytes, topk=3)

        if not (label == target_label and float(prob) >= float(threshold)):
            continue

        finding_id = str(uuid.uuid4())
        frame_path = (out / f"{finding_id}.jpg").as_posix()
        Path(frame_path).write_bytes(jpg_bytes)

        ocr_text, lat, lon = _ocr_coords(reader, frame)

        ts_ms = int(round((frame_idx / fps) * 1000))
        findings.append(
            VideoFinding(
                id=finding_id,
                frame_idx=frame_idx,
                ts_ms=ts_ms,
                label=label,
                prob=float(prob),
                topk=topk,
                ocr_text=ocr_text,
                lat=lat,
                lon=lon,
                frame_path=frame_path,
                model="pothole",
            )
        )

    cap.release()
    return findings


def _draw_sign_boxes(frame_bgr: np.ndarray, detections: List[dict]) -> np.ndarray:
    out = frame_bgr.copy()
    for d in detections:
        bp = d.get("bbox_px") or {}
        x1 = int(bp.get("x1", 0))
        y1 = int(bp.get("y1", 0))
        x2 = int(bp.get("x2", 0))
        y2 = int(bp.get("y2", 0))
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 0, 255), 3)
        txt = f"{d.get('label', '?')} {float(d.get('conf', 0)):.2f}"
        cv2.putText(out, txt, (x1, max(y1 - 8, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)
    return out


def analyze_video_signs_yolo(
    model_path: str,
    video_path: str,
    out_dir: str,
    sample_fps: float = 2.0,
    threshold: float = 0.35,
    ocr_enabled: bool = True,
    max_frames: int = 120,
) -> List[VideoFinding]:
    """Détecte signalétique endommagée (YOLO) frame par frame, sauvegarde images annotées."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps, _total, step, _dur, _est = _video_sampling(cap, sample_fps, max_frames)

    reader = None
    if ocr_enabled:
        reader = easyocr.Reader(["en"], gpu=False)

    findings: List[VideoFinding] = []
    frame_idx = -1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_idx += 1
        if frame_idx % step != 0:
            continue

        jpg_bytes = _encode_jpg_bgr(frame)
        try:
            raw_dets, _w, _h = detect_bytes(model_path, jpg_bytes, conf=threshold)
        except Exception:
            continue

        hits = [
            d
            for d in raw_dets
            if is_damaged_label(d["label"]) and float(d["conf"]) >= threshold
        ]
        if not hits:
            continue

        annotated = _draw_sign_boxes(frame, hits)
        jpg_out = _encode_jpg_bgr(annotated)
        finding_id = str(uuid.uuid4())
        frame_path = (out / f"{finding_id}.jpg").as_posix()
        Path(frame_path).write_bytes(jpg_out)

        best = max(hits, key=lambda x: float(x["conf"]))
        ocr_text, lat, lon = _ocr_coords(reader, frame)

        ts_ms = int(round((frame_idx / fps) * 1000))
        findings.append(
            VideoFinding(
                id=finding_id,
                frame_idx=frame_idx,
                ts_ms=ts_ms,
                label=best["label"],
                prob=float(best["conf"]),
                topk=[{"label": h["label"], "prob": float(h["conf"])} for h in hits[:5]],
                ocr_text=ocr_text,
                lat=lat,
                lon=lon,
                frame_path=frame_path,
                model="signs_damage",
                detection_count=len(hits),
            )
        )

    cap.release()
    return findings


def analyze_video_combined(
    pothole_loaded: Optional[LoadedModel],
    signs_model_path: Optional[str],
    video_path: str,
    out_dir: str,
    sample_fps: float = 2.0,
    pothole_threshold: float = 0.8,
    signs_threshold: float = 0.35,
    target_label: str = "potholes",
    ocr_enabled: bool = True,
    max_frames: int = 120,
) -> Tuple[List[VideoFinding], dict]:
    """
    Une seule lecture de la vidéo — pothole + YOLO sur les mêmes frames (2× plus rapide que 2 passes).
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps, total, step, duration_sec, est_samples = _video_sampling(cap, sample_fps, max_frames)

    reader = None
    if ocr_enabled:
        reader = easyocr.Reader(["en"], gpu=False)

    findings: List[VideoFinding] = []
    frame_idx = -1
    analyzed = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_idx += 1
        if frame_idx % step != 0:
            continue
        analyzed += 1

        jpg_bytes = _encode_jpg_bgr(frame)
        ts_ms = int(round((frame_idx / fps) * 1000))

        if pothole_loaded is not None:
            label, prob, topk = predict_bytes(pothole_loaded, jpg_bytes, topk=3)
            if label == target_label and float(prob) >= float(pothole_threshold):
                finding_id = str(uuid.uuid4())
                frame_path = (out / f"{finding_id}.jpg").as_posix()
                Path(frame_path).write_bytes(jpg_bytes)
                ocr_text, lat, lon = _ocr_coords(reader, frame)
                findings.append(
                    VideoFinding(
                        id=finding_id,
                        frame_idx=frame_idx,
                        ts_ms=ts_ms,
                        label=label,
                        prob=float(prob),
                        topk=topk,
                        ocr_text=ocr_text,
                        lat=lat,
                        lon=lon,
                        frame_path=frame_path,
                        model="pothole",
                    )
                )

        if signs_model_path and os.path.exists(signs_model_path):
            try:
                raw_dets, _w, _h = detect_bytes(signs_model_path, jpg_bytes, conf=signs_threshold)
            except Exception:
                raw_dets = []
            hits = [
                d
                for d in raw_dets
                if is_damaged_label(d["label"]) and float(d["conf"]) >= signs_threshold
            ]
            if hits:
                annotated = _draw_sign_boxes(frame, hits)
                jpg_out = _encode_jpg_bgr(annotated)
                finding_id = str(uuid.uuid4())
                frame_path = (out / f"{finding_id}.jpg").as_posix()
                Path(frame_path).write_bytes(jpg_out)
                best = max(hits, key=lambda x: float(x["conf"]))
                ocr_text, lat, lon = _ocr_coords(reader, frame)
                findings.append(
                    VideoFinding(
                        id=finding_id,
                        frame_idx=frame_idx,
                        ts_ms=ts_ms,
                        label=best["label"],
                        prob=float(best["conf"]),
                        topk=[{"label": h["label"], "prob": float(h["conf"])} for h in hits[:5]],
                        ocr_text=ocr_text,
                        lat=lat,
                        lon=lon,
                        frame_path=frame_path,
                        model="signs_damage",
                        detection_count=len(hits),
                    )
                )

    cap.release()
    meta = {
        "duration_sec": round(duration_sec, 1),
        "total_frames": total,
        "frames_analyzed": analyzed,
        "sample_step": step,
        "max_frames_cap": max_frames,
        "estimated_samples": est_samples,
    }
    return findings, meta

