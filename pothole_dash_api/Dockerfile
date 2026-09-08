# ---- Build stage ----
FROM python:3.11-slim AS build

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Dependances systeme necessaires pour compiler certains paquets Python
# (opencv-python, torch, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
# Wheels CPU pour torch/torchvision : evite de telecharger les builds CUDA
# (plusieurs Go) qui ne servent a rien sans GPU.
RUN pip install --prefix=/install \
        --extra-index-url https://download.pytorch.org/whl/cpu \
        -r requirements.txt

# ---- Runtime stage ----
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODEL_PATH=models/model.pt \
    SIGNS_DAMAGE_MODEL_PATH=models/signs_damage_yolo.pt \
    EVENTS_PATH=data/events.jsonl \
    FRAMES_DIR=data/frames

WORKDIR /app

# Librairies partagees requises au runtime par opencv-python / torch / easyocr
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser

COPY --from=build /install /usr/local

COPY . .

RUN mkdir -p data/frames models \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "api:app"]
