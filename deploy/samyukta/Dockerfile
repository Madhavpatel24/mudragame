# Aparna's Samyukta model server (vendor/samyukta-hasta-game), unchanged, as a container.
# Build from the repository root:  docker build -f deploy/samyukta/Dockerfile -t samyukta-server .
FROM python:3.10.13-slim

# mediapipe's Tasks API needs these libraries at runtime, even on a CPU-only machine
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgles2 libegl1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=2 \
    MALLOC_ARENA_MAX=2

WORKDIR /app

# The CPU build is about 200 MB. The default Linux build pulls in gigabytes of GPU libraries.
RUN pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cpu

COPY deploy/samyukta/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# Only what the server needs: her code, her config, her trained model, and the hand tracker.
COPY vendor/samyukta-hasta-game/samyukta ./samyukta
COPY vendor/samyukta-hasta-game/game/game_model_server.py ./game/game_model_server.py
COPY vendor/samyukta-hasta-game/config.yaml ./config.yaml
COPY vendor/samyukta-hasta-game/outputs/model/model.pt ./outputs/model/model.pt
COPY asamyukta/frontend/public/model/hand_landmarker_float16.task ./hand_landmarker.task

RUN useradd --create-home app && chown -R app /app
USER app

# Render sets PORT; locally it falls back to 8001.
CMD ["sh", "-c", "uvicorn --app-dir game game_model_server:app --host 0.0.0.0 --port ${PORT:-8001}"]
