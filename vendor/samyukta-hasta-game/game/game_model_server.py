"""API-only model server for the game (no frontend, no camera).

Run from the project root: python game\\game_model_server.py
Health check: http://localhost:8001/health
"""
import logging
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from samyukta.hand_crop import HandCropper
from samyukta.infer import MudraClassifier
from samyukta.utils import load_config

log = logging.getLogger("uvicorn.error")
lock = threading.Lock()
state = {"cropper": None, "classifier": None, "ready": False}


@asynccontextmanager
async def lifespan(app: FastAPI):
    del app
    cfg = load_config(str(ROOT / "config.yaml"))
    model_path = ROOT / "outputs" / "model" / "model.pt"

    landmarker_path = Path(cfg["crop"]["hand_landmarker_model"])
    if not landmarker_path.is_absolute():
        landmarker_path = ROOT / landmarker_path
    if not landmarker_path.is_file():
        landmarker_path = ROOT / "hand_landmarker.task"

    if model_path.is_file():
        state["classifier"] = MudraClassifier(str(model_path))
        log.info("[game-model] %d classes loaded", len(state["classifier"].class_names))
    else:
        log.error("[game-model] missing %s. Run `python run.py train` first.", model_path)

    crop_cfg = cfg["crop"]
    if landmarker_path.is_file() and crop_cfg["method"] == "mediapipe":
        state["cropper"] = HandCropper(
            method="mediapipe",
            roi=crop_cfg["roi"],
            margin=crop_cfg["margin"],
            min_conf=crop_cfg["min_detection_confidence"],
            landmarker_model=str(landmarker_path),
        )
    else:
        log.warning("[game-model] hand landmarker unavailable; using full-frame crops")
        state["cropper"] = HandCropper(method="full")

    state["ready"] = state["classifier"] is not None and state["cropper"] is not None
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    c = state["classifier"]
    return {"ready": state["ready"], "classes": getattr(c, "class_names", [])}


@app.post("/predict")
def predict(file: UploadFile = File(...)):
    if not state["ready"]:
        raise HTTPException(status_code=503, detail="model not loaded")

    bgr = cv2.imdecode(np.frombuffer(file.file.read(), np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="could not decode image")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    with lock:
        crop, crop_info = state["cropper"](rgb)
        probabilities, _ = state["classifier"].predict([crop])

    probs = probabilities[0]
    names = state["classifier"].class_names
    idx = np.argsort(probs)[-5:][::-1]
    return {
        "top": [{"label": names[i], "prob": float(probs[i])} for i in idx],
        "crop": crop_info,
    }


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="127.0.0.1", port=8001)