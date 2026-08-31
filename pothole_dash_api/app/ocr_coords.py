import re
from typing import Optional, Tuple


_RE_LATLON = re.compile(
    r"(?P<lat>[+-]?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(?P<lon>[+-]?\d{1,3}(?:\.\d+)?)"
)


def parse_lat_lon(text: str) -> Optional[Tuple[float, float]]:
    """
    Extract (lat, lon) from OCR text.
    Accepts formats like:
    - "36.8065, 10.1815"
    - "36.8065 10.1815"
    """
    if not text:
        return None
    m = _RE_LATLON.search(text.replace("\n", " "))
    if not m:
        return None
    try:
        lat = float(m.group("lat"))
        lon = float(m.group("lon"))
    except Exception:
        return None

    # basic sanity bounds
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon

