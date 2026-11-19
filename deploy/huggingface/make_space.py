"""Builds a ready-to-upload Hugging Face Space for Aparna's Samyukta server.

Run from anywhere:  python deploy/huggingface/make_space.py
It writes deploy/huggingface/space/ (a folder to upload to the Space). Nothing in vendor/ is changed.

The Docker SDK on Hugging Face is a paid option, so this uses the free Gradio SDK, which runs any Python
program: app.py starts Aparna's server (game/game_model_server.py, unchanged) on port 7860.
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

# Her server, her config, her trained model, and the hand tracker.
shutil.copytree(VENDOR / "samyukta", OUT / "samyukta", ignore=shutil.ignore_patterns("__pycache__"))
shutil.copy(VENDOR / "game" / "game_model_server.py", OUT / "game" / "game_model_server.py")
shutil.copy(VENDOR / "config.yaml", OUT / "config.yaml")
shutil.copy(VENDOR / "outputs" / "model" / "model.pt", OUT / "outputs" / "model" / "model.pt")
shutil.copy(ROOT / "asamyukta" / "frontend" / "public" / "model" / "hand_landmarker_float16.task", OUT / "hand_landmarker.task")

# Hugging Face reads this header to know how to run the Space.
(OUT / "README.md").write_text(
    "---\n"
    "title: Samyukta Model Server\n"
    "sdk: gradio\n"
    "app_file: app.py\n"
    "python_version: 3.10\n"
    "pinned: false\n"
    "---\n\n"
    "Model server for the two-hand (Samyukta) mudra game. Endpoints: `GET /health`, `POST /predict`.\n",
    encoding="utf-8",
)

(OUT / "app.py").write_text(
    '''"""Starts Aparna's model server (game/game_model_server.py, unchanged) for Hugging Face."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "game"))

import uvicorn
from game_model_server import app


# Hugging Face's start-up check asks for "/", which her server does not define.
@app.get("/")
def root():
    return {"ok": True, "endpoints": ["/health", "/predict"]}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))
''',
    encoding="utf-8",
)

# System libraries that MediaPipe needs at run time.
(OUT / "packages.txt").write_text("libgles2\nlibegl1\nlibgl1\nlibglib2.0-0\n", encoding="utf-8")

# The CPU build of PyTorch is about 200 MB; the default Linux build pulls in gigabytes of GPU libraries.
versions = (ROOT / "deploy" / "samyukta" / "requirements.txt").read_text(encoding="utf-8")
(OUT / "requirements.txt").write_text(
    "--extra-index-url https://download.pytorch.org/whl/cpu\ntorch==2.8.0\ntorchvision==0.23.0\n" + versions,
    encoding="utf-8",
)

print(f"Space folder ready: {OUT}")
