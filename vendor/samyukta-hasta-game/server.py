"""Live webcam inference server.

Run: python server.py
Open: http://localhost:8000
"""
import base64
import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from samyukta.hand_crop import HandCropper
from samyukta.infer import MudraClassifier
from samyukta.utils import load_config


ROOT = Path(__file__).resolve().parent
log = logging.getLogger("uvicorn.error")
lock = threading.Lock()
state = {"cropper": None, "classifier": None, "ready": False}


@asynccontextmanager
async def lifespan(app: FastAPI):
    del app
    cfg = load_config(str(ROOT / "config.yaml"))
    model_path = ROOT / "outputs" / "model" / "model.pt"
    configured_model = cfg["crop"]["hand_landmarker_model"]
    landmarker_path = Path(configured_model)
    if not landmarker_path.is_absolute():
        landmarker_path = ROOT / landmarker_path
    if not landmarker_path.is_file():
        landmarker_path = ROOT / "hand_landmarker.task"

    if not model_path.is_file():
        log.error("[server] classifier missing at %s. Run `python run.py train` first.", model_path)
    else:
        log.info("[server] loading classifier %s", model_path)
        state["classifier"] = MudraClassifier(str(model_path))
        log.info("[server] %d classes: %s",
                 len(state["classifier"].class_names),
                 state["classifier"].class_names)

    crop_cfg = cfg["crop"]
    if landmarker_path.is_file() and crop_cfg["method"] == "mediapipe":
        log.info("[server] loading hand landmarker %s", landmarker_path)
        state["cropper"] = HandCropper(
            method="mediapipe",
            roi=crop_cfg["roi"],
            margin=crop_cfg["margin"],
            min_conf=crop_cfg["min_detection_confidence"],
            landmarker_model=str(landmarker_path),
        )
    else:
        log.warning("[server] hand landmarker unavailable; using full-frame crops")
        state["cropper"] = HandCropper(method="full")

    state["ready"] = state["classifier"] is not None and state["cropper"] is not None
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _topk(probs, names, k=5):
    indices = np.argsort(probs)[-k:][::-1]
    return [{"label": names[index], "prob": float(probs[index])} for index in indices]


def _crop_preview_b64(rgb, quality=80):
    ok, buffer = cv2.imencode(
        ".jpg",
        cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR),
        [cv2.IMWRITE_JPEG_QUALITY, quality],
    )
    if not ok:
        return ""
    encoded = base64.b64encode(buffer.tobytes()).decode("ascii")
    return "data:image/jpeg;base64," + encoded


@app.get("/health")
def health():
    classifier = state["classifier"]
    return {
        "ready": state["ready"],
        "model_version": getattr(classifier, "version", None),
        "classes": getattr(classifier, "class_names", []),
    }


@app.post("/predict")
def predict(file: UploadFile = File(...)):
    if not state["ready"]:
        raise HTTPException(status_code=503, detail="model not loaded")

    started = time.perf_counter()
    encoded = file.file.read()
    pixels = np.frombuffer(encoded, np.uint8)
    bgr = cv2.imdecode(pixels, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="could not decode image")

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]

    with lock:
        crop, crop_info = state["cropper"](rgb)
        probabilities, _ = state["classifier"].predict([crop])

    probs = probabilities[0]
    top = _topk(probs, state["classifier"].class_names)
    top_index = int(probs.argmax())
    elapsed_ms = (time.perf_counter() - started) * 1000

    return {
        "image": {"width": width, "height": height},
        "top": top,
        "top1": state["classifier"].class_names[top_index],
        "top1_prob": float(probs[top_index]),
        "crop": crop_info,
        "crop_preview": _crop_preview_b64(crop),
        "elapsed_ms": round(elapsed_ms, 1),
    }


frontend = ROOT / "frontend"
if frontend.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend), html=True), name="frontend")
else:
    log.warning("[server] frontend directory not found at %s", frontend)


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)
