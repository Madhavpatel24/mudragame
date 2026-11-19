"""Builds a ready-to-push Hugging Face Space for Aparna's Samyukta server.

Run from anywhere:  python deploy/huggingface/make_space.py
It writes deploy/huggingface/space/ (a folder to push as its own repo). Nothing in vendor/ is changed.
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "vendor" / "samyukta-hasta-game"
OUT = Path(__file__).resolve().parent / "space"

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "game").mkdir(parents=True)
(OUT / "outputs" / "model").mkdir(parents=True)

shutil.copytree(VENDOR / "samyukta", OUT / "samyukta", ignore=shutil.ignore_patterns("__pycache__"))
shutil.copy(VENDOR / "game" / "game_model_server.py", OUT / "game" / "game_model_server.py")
shutil.copy(VENDOR / "config.yaml", OUT / "config.yaml")
shutil.copy(VENDOR / "outputs" / "model" / "model.pt", OUT / "outputs" / "model" / "model.pt")
shutil.copy(ROOT / "asamyukta" / "frontend" / "public" / "model" / "hand_landmarker_float16.task", OUT / "hand_landmarker.task")
shutil.copy(ROOT / "deploy" / "samyukta" / "requirements.txt", OUT / "requirements.txt")

# Hugging Face reads this header to know it is a Docker Space and which port to forward.
(OUT / "README.md").write_text(
    "---\ntitle: Samyukta Model Server\nsdk: docker\napp_port: 7860\npinned: false\n---\n\n"
    "Model server for the two-hand (Samyukta) mudra game. Endpoints: `GET /health`, `POST /predict`.\n",
    encoding="utf-8",
)

# Files over 10 MB must go through Git LFS on the Hub; model.pt is about 16 MB.
(OUT / ".gitattributes").write_text("*.pt filter=lfs diff=lfs merge=lfs -text\n", encoding="utf-8")

(OUT / "Dockerfile").write_text(
    """FROM python:3.10.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgles2 libegl1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 OMP_NUM_THREADS=2 MALLOC_ARENA_MAX=2 PORT=7860

# Spaces run the container as user 1000.
RUN useradd -m -u 1000 user
WORKDIR /app

RUN pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=user . /app
USER user

CMD ["sh", "-c", "uvicorn --app-dir game game_model_server:app --host 0.0.0.0 --port ${PORT}"]
""",
    encoding="utf-8",
)
print(f"Space folder ready: {OUT}")
