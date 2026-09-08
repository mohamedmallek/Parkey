"""
Estimation approximative de la taille d'un nid-de-poule à partir de la bbox
et d'une calibration route (largeur de voie de référence).

Méthode documentée pour PFE :
- Calibration : voie standard 3,5 m visible sur ~85 % de la largeur image (dashcam).
- Localisation : tache claire/beige (agrégat) ou cavité sombre si pas de bbox YOLO.
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

# --- Calibration adaptative (corrige le biais "toujours très grand") ---------
# L'ancienne version supposait TOUJOURS que la largeur de l'image entière
# correspond à une voie de 3,5 m, quelle que soit la photo. Une photo prise
# de près (macro, smartphone tenu à bout de bras au-dessus du trou) ne montre
# pourtant qu'une fraction de cette largeur réelle : la même bbox en pixels y
# représente alors un objet beaucoup plus petit. Sans capteur de profondeur ni
# objet de référence, la taille absolue reste un problème mal posé (une petite
# fissure filmée de très près et un grand trou filmé de loin peuvent produire
# la même bbox relative) : on réduit ce biais avec deux signaux indépendants
# du ratio bbox/image plutôt que de le "corriger" par une seconde hypothèse
# circulaire basée sur la même bbox.
MARKING_WIDTH_CM = float(os.environ.get("POTHOLE_MARKING_WIDTH_CM", "15"))
MARKING_MIN_PX = float(os.environ.get("POTHOLE_MARKING_MIN_PX", "12"))
CLOSEUP_VISIBLE_WIDTH_M = float(os.environ.get("POTHOLE_CLOSEUP_VISIBLE_WIDTH_M", "0.9"))
CLOSEUP_BHATTACHARYYA_THRESHOLD = float(os.environ.get("POTHOLE_CLOSEUP_BHATTACHARYYA", "0.40"))
# Constat empirique (500+ photos réelles du jeu de données ONSR) : même les
# photos "contexte" (rue/trottoir visibles) sont presque toujours prises à
# 2-4 m du trou par un agent à pied, jamais à la largeur d'une voie complète
# de dashcam (3,5 m). Réutiliser 3,5 m comme largeur visible par défaut
# gonflait systématiquement la taille estimée (biais "toujours très grand").
LANE_WIDTH_CONTEXT_M = float(os.environ.get("POTHOLE_LANE_WIDTH_CONTEXT_M", "1.8"))
# Exception : une excavation profonde (cavité sombre à fort contraste)
# occupant une grande partie de l'image est le plus souvent réellement
# grande (effondrement, tranchée) et non un effet de zoom : on l'autorise
# alors à utiliser une largeur visible proche de la voie complète.
CAVITY_LARGE_AREA_FRAC = float(os.environ.get("POTHOLE_CAVITY_LARGE_AREA_FRAC", "0.12"))
CAVITY_CONTEXT_WIDTH_M = float(os.environ.get("POTHOLE_CAVITY_CONTEXT_WIDTH_M", "3.2"))

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


def _pad_box(x1: int, y1: int, x2: int, y2: int, w: int, h: int, pad: float = 0.1) -> Dict[str, int]:
    bw, bh = max(1, x2 - x1), max(1, y2 - y1)
    px, py = int(bw * pad), int(bh * pad)
    return {
        "x1": max(0, x1 - px),
        "y1": max(0, y1 - py),
        "x2": min(w, x2 + px),
        "y2": min(h, y2 + py),
    }


def _local_std(gray: np.ndarray, k: int = 9) -> np.ndarray:
    g = gray.astype(np.float32)
    mean = cv2.blur(g, (k, k))
    mean2 = cv2.blur(g * g, (k, k))
    return np.sqrt(np.clip(mean2 - mean * mean, 0, None))


def _norm01(m: np.ndarray) -> np.ndarray:
    m = m.astype(np.float32)
    lo, hi = float(np.percentile(m, 2)), float(np.percentile(m, 98))
    if hi - lo < 1e-5:
        return np.zeros_like(m, dtype=np.float32)
    return np.clip((m - lo) / (hi - lo), 0, 1)


def _local_peaks(score: np.ndarray, n: int = 7, min_dist: int = 18) -> list[Tuple[int, int]]:
    sm = cv2.GaussianBlur(score, (7, 7), 0)
    kern = max(7, min_dist | 1)
    dil = cv2.dilate(sm, np.ones((kern, kern), np.uint8))
    peaks = (sm >= dil - 1e-6) & (sm > float(sm.max()) * 0.22)
    ys, xs = np.where(peaks)
    pts = sorted(zip(ys.tolist(), xs.tolist()), key=lambda p: sm[p], reverse=True)
    kept: list[Tuple[int, int]] = []
    for y, x in pts:
        if any((y - ky) ** 2 + (x - kx) ** 2 < min_dist**2 for ky, kx in kept):
            continue
        kept.append((y, x))
        if len(kept) >= n:
            break
    return kept


def _grow_from_seed(score: np.ndarray, seed: Tuple[int, int], ratio: float) -> Optional[Tuple[int, int, int, int]]:
    sy, sx = seed
    peak = float(score[sy, sx])
    if peak <= 1e-6:
        return None
    mask = (score >= peak * ratio).astype(np.uint8)
    _n, labels = cv2.connectedComponents(mask)
    lab = int(labels[sy, sx])
    if lab == 0:
        return None
    ys, xs = np.where(labels == lab)
    if xs.size < 18:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _color_grow(lab: np.ndarray, seed: Tuple[int, int], max_frac: float = 0.16) -> Optional[Tuple[int, int, int, int]]:
    """Étend une tache beige/agrégat depuis un point, sans avaler toute la route."""
    h, w = lab.shape[:2]
    sy, sx = seed
    target = lab[sy, sx]
    dist = np.sqrt(((lab - target) ** 2).sum(axis=-1))
    img_area = h * w
    chosen = None
    for thr in (12.0, 16.0, 20.0, 24.0):
        mask = (dist < thr).astype(np.uint8)
        _n, labels = cv2.connectedComponents(mask)
        labid = int(labels[sy, sx])
        if labid == 0:
            continue
        ys, xs = np.where(labels == labid)
        if ys.size > img_area * max_frac:
            break
        if ys.size < 24:
            continue
        chosen = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return chosen


def _box_quality(
    L: np.ndarray,
    score: np.ndarray,
    box: Tuple[int, int, int, int],
    kind: str,
    warm: Optional[np.ndarray] = None,
) -> float:
    h, w = L.shape
    x1, y1, x2, y2 = box
    bw, bh = max(1, x2 - x1), max(1, y2 - y1)
    area = bw * bh
    img_area = h * w
    if area < img_area * 0.008 or area > img_area * 0.62:
        return -1.0
    aspect = bw / bh
    if aspect < 0.28 or aspect > (3.55 if kind == "cavity" else 2.7):
        return -1.0
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    inset = min(cx / w, cy / h, 1 - cx / w, 1 - cy / h)
    if inset < 0.06:
        return -1.0
    inner_l = float(np.mean(L[y1:y2, x1:x2]))
    pad = max(6, int(0.32 * max(bw, bh)))
    sy1, sy2 = max(0, y1 - pad), min(h, y2 + pad)
    sx1, sx2 = max(0, x1 - pad), min(w, x2 + pad)
    surround = L[sy1:sy2, sx1:sx2].copy()
    surround[y1 - sy1 : y2 - sy1, x1 - sx1 : x2 - sx1] = np.nan
    outer = surround[~np.isnan(surround)]
    if outer.size < 20:
        return -1.0
    outer_l = float(np.mean(outer))
    if kind == "fill":
        contrast = inner_l - outer_l
        if contrast < 3.5 or y2 > h * 0.78:
            return -1.0
        warm_s = float(np.mean(warm[y1:y2, x1:x2])) if warm is not None else 0.0
        if inner_l < 95 or warm_s < 0.12 or area > img_area * 0.18:
            return -1.0
        inner_s = float(np.mean(score[y1:y2, x1:x2]))
        return (6 + contrast) * (0.4 + inner_s) * (0.45 + 2.2 * warm_s) * (0.5 + inset)
    contrast = outer_l - inner_l
    if contrast < 4.5 or cy < h * 0.28:
        return -1.0
    inner_s = float(np.mean(score[y1:y2, x1:x2]))
    aspect_pen = 0.62 if aspect > 2.4 else 1.0
    area_term = min(float(np.sqrt(area)), float(np.sqrt(img_area * 0.22)))
    return (6 + contrast) * (0.35 + inner_s) * (0.5 + inset) * aspect_pen * area_term


def _detect_pothole_bbox_heuristic(bgr: np.ndarray) -> Tuple[Optional[Dict[str, int]], str]:
    """Localise le trou : tache claire/beige (agrégat) ou cavité sombre, pas un objet au bord."""
    h, w = bgr.shape[:2]
    if h < 16 or w < 16:
        return None, "no_region"

    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    luma = lab[:, :, 0]
    yellow = lab[:, :, 2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    tex = _local_std(gray, 9)
    sig = max(7.0, min(w, h) / 16.0)
    loc_l = cv2.GaussianBlur(luma, (0, 0), sig)
    loc_b = cv2.GaussianBlur(yellow, (0, 0), sig)
    light = _norm01(np.clip(luma - loc_l, 0, None))
    dark = _norm01(np.clip(loc_l - luma, 0, None))
    warm = _norm01(np.clip(yellow - loc_b, 0, None))
    brown = _norm01(cv2.inRange(hsv, (5, 22, 40), (32, 210, 235)).astype(np.float32))

    mx, my = max(6, int(w * 0.09)), max(6, int(h * 0.06))
    valid = np.ones((h, w), np.float32)
    valid[:my, :] = 0
    valid[h - max(6, int(h * 0.08)) :, :] = 0
    valid[:, :mx] = 0
    valid[:, w - mx :] = 0
    valid[(luma < 65) & (tex < np.percentile(tex, 32))] *= 0.05

    fill = cv2.GaussianBlur((0.25 * light + 0.70 * warm + 0.15 * brown) * valid, (7, 7), 0)
    fill[int(h * 0.78) :, :] *= 0.08
    cavity = (0.80 * dark + 0.20 * brown) * valid
    cavity[: int(h * 0.30), :] *= 0.05
    cavity = cv2.GaussianBlur(cavity, (7, 7), 0)

    min_dist = max(16, min(w, h) // 10)
    fills: list[Tuple[float, Tuple[int, int, int, int], int]] = []
    cavities: list[Tuple[float, Tuple[int, int, int, int], int]] = []

    for seed in _local_peaks(fill, n=7, min_dist=min_dist):
        box = _color_grow(lab, seed)
        if box is None:
            continue
        score = _box_quality(luma, fill, box, "fill", warm)
        if score > 0:
            fills.append((score, box, (box[2] - box[0]) * (box[3] - box[1])))

    for seed in _local_peaks(cavity, n=7, min_dist=min_dist):
        box = _grow_from_seed(cavity, seed, 0.50)
        if box is None:
            continue
        score = _box_quality(luma, cavity, box, "cavity", warm)
        if score > 0:
            cavities.append((score, box, (box[2] - box[0]) * (box[3] - box[1])))

    best_fill = max(fills, key=lambda x: x[0]) if fills else None
    best_cavity = max(cavities, key=lambda x: x[0]) if cavities else None
    img_area = h * w
    if best_fill and best_cavity:
        # Une excavation réelle est beaucoup plus grande qu’une tache d’agrégat.
        if best_cavity[2] > max(best_fill[2] * 2.2, img_area * 0.10):
            chosen, method, pad = best_cavity[1], "cavity_heuristic", 0.08
        else:
            chosen, method, pad = best_fill[1], "fill_heuristic", 0.22
    elif best_cavity:
        chosen, method, pad = best_cavity[1], "cavity_heuristic", 0.08
    elif best_fill:
        chosen, method, pad = best_fill[1], "fill_heuristic", 0.22
    else:
        return None, "no_region"

    x1, y1, x2, y2 = chosen
    return _pad_box(x1, y1, x2, y2, w, h, pad), method


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


def _is_closeup_shot(bgr: np.ndarray) -> bool:
    """
    Distingue une photo "contexte" (rue, trottoir, ciel, bâtiments — la voie
    occupe alors une fraction connue et raisonnable de l'image, l'ancienne
    hypothèse tient à peu près) d'une photo macro/close-up (le cadre entier
    n'est que de l'enrobé, aucun repère de profondeur : supposer 3,5 m de
    voie sur toute la largeur surestime alors fortement la taille réelle).

    Signal : on compare l'apparence (histogramme teinte/saturation) de la
    bande haute de l'image à celle de la bande basse. Sur une photo de rue,
    le haut montre du ciel/des bâtiments/un horizon très différent de la
    chaussée du bas. Sur une photo macro posée au-dessus du trou, le haut et
    le bas sont statistiquement la même texture d'enrobé.
    """
    h, w = bgr.shape[:2]
    if h < 40 or w < 40:
        return False
    top = bgr[: max(1, int(h * 0.18)), :]
    bottom = bgr[int(h * 0.75) :, :]
    if top.size == 0 or bottom.size == 0:
        return False
    hsv_top = cv2.cvtColor(top, cv2.COLOR_BGR2HSV)
    hsv_bot = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)
    hist_top = cv2.calcHist([hsv_top], [0, 1], None, [30, 32], [0, 180, 0, 256])
    hist_bot = cv2.calcHist([hsv_bot], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(hist_top, hist_top, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist_bot, hist_bot, 0, 1, cv2.NORM_MINMAX)
    similarity = cv2.compareHist(hist_top, hist_bot, cv2.HISTCMP_BHATTACHARYYA)
    return similarity < CLOSEUP_BHATTACHARYYA_THRESHOLD


def _detect_marking_width_px(bgr: np.ndarray, exclude_box: Optional[Dict[str, int]]) -> Optional[float]:
    """
    Cherche un marquage au sol (ligne blanche/jaune) dans l'image pour s'en
    servir de référence physique (largeur standard ~15 cm) : un objet de
    taille connue dans la photo donne une échelle bien plus fiable qu'une
    hypothèse générale sur le cadrage.
    """
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    local_bg = cv2.GaussianBlur(gray, (0, 0), max(9.0, min(w, h) / 20.0))
    rel_bright = gray.astype(np.float32) - local_bg.astype(np.float32)
    bright_mask = (rel_bright > 18).astype(np.uint8)
    low_sat_mask = (hsv[:, :, 1] < 70).astype(np.uint8)
    mask = bright_mask & low_sat_mask
    if exclude_box:
        x1, y1 = max(0, exclude_box["x1"]), max(0, exclude_box["y1"])
        x2, y2 = min(w, exclude_box["x2"]), min(h, exclude_box["y2"])
        mask[y1:y2, x1:x2] = 0
    # Un marquage au sol est forcément sur la chaussée : on écarte la bande
    # haute de l'image (ciel, façades, fenêtres) où traînent le plus de faux
    # positifs (montants de clôture de chantier, cadres de fenêtre...).
    mask[: int(h * 0.30), :] = 0
    # La texture granuleuse de l'enrobé (petits graviers clairs) génère des
    # milliers de minuscules composantes qui noient le vrai marquage : un
    # nettoyage morphologique (ouverture pour effacer le bruit, fermeture
    # verticale pour reconnecter les tirets d'un marquage discontinu) rend
    # la détection bien plus fiable sur des photos réelles.
    mask8 = (mask * 255).astype(np.uint8)
    mask8 = cv2.morphologyEx(mask8, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    mask8 = cv2.morphologyEx(mask8, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 25)))
    mask = (mask8 > 0).astype(np.uint8)

    n, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    candidates: list[float] = []
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 40:
            continue
        comp = (labels == i).astype(np.uint8)
        pts = cv2.findNonZero(comp)
        if pts is None:
            continue
        (_cx, _cy), (rw, rh), _ang = cv2.minAreaRect(pts)
        major, minor = max(rw, rh), min(rw, rh)
        if minor < 3:
            continue
        aspect = major / minor
        # Un marquage est un trait fin et long, pas une tache d'agrégat.
        if aspect >= 4.0 and major > 0.15 * h and minor < 0.12 * w:
            candidates.append(float(minor))
    # On n'accepte cette référence que si plusieurs mesures indépendantes
    # s'accordent (un seul trait détecté peut être un faux positif — pare-
    # chocs, tube de chantier, bordure de trottoir). Plutôt que de rejeter
    # toute la lecture dès qu'une seule mesure isolée diverge (ex. un
    # fragment de fissure confondu avec un marquage), on cherche le plus
    # grand groupe de mesures qui s'accordent entre elles (écart <= 30 %).
    if len(candidates) < 2:
        return None
    best_cluster: list[float] = []
    for i, ci in enumerate(candidates):
        cluster = [ci]
        for j, cj in enumerate(candidates):
            if i == j:
                continue
            avg = (ci + cj) / 2.0
            if avg > 0 and abs(ci - cj) / avg <= 0.30:
                cluster.append(cj)
        if len(cluster) > len(best_cluster):
            best_cluster = cluster
    if len(best_cluster) < 2:
        return None
    best_cluster.sort()
    mid = len(best_cluster) // 2
    result = (best_cluster[mid - 1] + best_cluster[mid]) / 2.0 if len(best_cluster) % 2 == 0 else best_cluster[mid]
    # Sur une petite image (vignette basse résolution), un marquage ne
    # mesure parfois que quelques pixels : une erreur d'un seul pixel y
    # change alors l'estimation finale de plus de 10 %. Sous ce seuil, la
    # mesure est trop bruitée pour servir de référence fiable.
    if result < MARKING_MIN_PX:
        return None
    return result


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
        box = detected

    if not box:
        return {
            "bbox_px": None,
            "bbox_norm": None,
            "width_cm_est": None,
            "length_cm_est": None,
            "max_dim_cm_est": None,
            "size_class": None,
            "depth_proxy": None,
            "depth_score": None,
            "calibration": {
                "lane_width_m": LANE_WIDTH_M,
                "road_width_fraction": ROAD_WIDTH_FRACTION,
                "ppm_at_reference": None,
                "method": method,
                "margin_pct": ERROR_MARGIN_PCT,
                "note": "Le trou n’a pas pu être localisé clairement sur la photo.",
            },
        }

    bw = max(1, box["x2"] - box["x1"])
    bh = max(1, box["y2"] - box["y1"])

    # --- Calibration adaptative : marquage détecté > excavation large > contexte rue > repli macro.
    area_frac = (bw * bh) / float(w * h)
    marking_px = _detect_marking_width_px(bgr, box)
    if marking_px:
        ppm = marking_px / (MARKING_WIDTH_CM / 100.0)
        calib_method = "marking_reference"
        confidence = "haute"
    elif method == "cavity_heuristic" and area_frac >= CAVITY_LARGE_AREA_FRAC:
        ppm = w / CAVITY_CONTEXT_WIDTH_M
        calib_method = "cavity_context_large"
        confidence = "moyenne"
    elif not _is_closeup_shot(bgr):
        ppm = w / LANE_WIDTH_CONTEXT_M
        calib_method = "lane_width_context"
        confidence = "moyenne"
    else:
        ppm = w / CLOSEUP_VISIBLE_WIDTH_M
        calib_method = "closeup_fallback"
        confidence = "faible"

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
            "marking_width_cm": MARKING_WIDTH_CM,
            "closeup_visible_width_m": CLOSEUP_VISIBLE_WIDTH_M,
            "lane_width_context_m": LANE_WIDTH_CONTEXT_M,
            "cavity_context_width_m": CAVITY_CONTEXT_WIDTH_M,
            "area_frac": round(area_frac, 4),
            "ppm_at_reference": round(ppm, 2),
            "method": method,
            "calibration_method": calib_method,
            "confidence": confidence,
            "margin_pct": ERROR_MARGIN_PCT,
            "note": (
                f"Estimation visuelle ±{ERROR_MARGIN_PCT} % (calibration: {calib_method}, "
                f"confiance {confidence}) — sans LiDAR. Classe S<15 cm, M<30, L<50, XL≥50."
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
