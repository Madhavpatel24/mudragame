"""Find the two hands in a video frame and return one crop around both.

Only a LOOSE bounding box is needed (the classifier does the recognising), so even
imperfect landmarks work. Fallbacks: ROI crop -> full frame. Every crop reports which
method produced it, so weak detections are visible in JSON.

Requires MediaPipe Tasks API (mediapipe >= 0.10) and the hand_landmarker.task model.
Download it once with:

    curl -o hand_landmarker.task https://storage.googleapis.com/mediapipe-models/\
hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

The model is auto-discovered from the repository root or the configured `models/` path.
You can also pass its path explicitly as `landmarker_model=` when constructing HandCropper.
"""
from pathlib import Path
import numpy as np


class HandCropper:
    def __init__(self, method="mediapipe", roi=None, margin=0.35, min_conf=0.3,
                 landmarker_model=None):
        self.method, self.roi, self.margin = method, roi, margin
        self._detect = None        # HandLandmarker instance
        self._mp = None            # mediapipe module (needed for mp.Image / mp.ImageFormat)
        self.backend = "none"
        if method == "mediapipe":
            self._init_mediapipe(min_conf, landmarker_model)
            if self._detect is None:
                print("[hand_crop] MediaPipe unavailable -> falling back to ROI/full-frame "
                      "crops. See README (hand model).")

    # -- backends -------------------------------------------------------------------------------
    def _resolve_model_path(self, model_path):
        project_root = Path(__file__).resolve().parent.parent
        candidates = []
        if model_path:
            configured = Path(model_path)
            candidates.append(configured)
            if not configured.is_absolute():
                candidates.append(project_root / configured)
                candidates.append(Path.cwd() / configured)
        candidates.extend([
            project_root / "hand_landmarker.task",
            Path.cwd() / "hand_landmarker.task",
            project_root / "models" / "hand_landmarker.task",
            Path.cwd() / "models" / "hand_landmarker.task",
        ])
        for candidate in candidates:
            if candidate.is_file():
                return candidate.resolve()
        return None

    def _init_mediapipe(self, min_conf, model_path):
        try:
            import mediapipe as mp
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision
        except Exception as e:
            print(f"[hand_crop] MediaPipe Tasks API not available: {e}")
            return

        resolved_model = self._resolve_model_path(model_path)
        if resolved_model is None:
            print(f"[hand_crop] hand_landmarker.task not found at {model_path!r}. "
                  "Download it (see module docstring) and pass its path as landmarker_model.")
            return

        try:
            base_options = mp_python.BaseOptions(model_asset_path=str(resolved_model))
            options = vision.HandLandmarkerOptions(
                base_options=base_options,
                num_hands=2,
                min_hand_detection_confidence=min_conf,
                min_hand_presence_confidence=min_conf,
                min_tracking_confidence=min_conf,
                running_mode=vision.RunningMode.IMAGE,
            )
            self._detect = vision.HandLandmarker.create_from_options(options)
            self._mp = mp
            self.backend = "mediapipe-tasks"
            print("[hand_crop] MediaPipe Tasks API (HandLandmarker) loaded successfully.")
        except Exception as e:
            print(f"[hand_crop] could not start HandLandmarker: {e}")

    # -- detection helper -----------------------------------------------------------------------
    def _hand_landmarks_px(self, img):
        """Run HandLandmarker on an RGB uint8 image. Returns a list of hands, where each
        hand is a list of (x_px, y_px) landmark coordinates. Empty list on failure/no hands."""
        if self._detect is None or self._mp is None or img.size == 0:
            return []
        try:
            mp_image = self._mp.Image(
                image_format=self._mp.ImageFormat.SRGB,
                data=np.ascontiguousarray(img),
            )
            result = self._detect.detect(mp_image)
        except Exception as e:
            print(f"[hand_crop] detection error: {e}")
            return []

        ih, iw = img.shape[:2]
        return [[(lm.x * iw, lm.y * ih) for lm in hand]
                for hand in (result.hand_landmarks or [])]

    # -- main -----------------------------------------------------------------------------------
    def __call__(self, rgb):
        """rgb: RGB uint8 numpy array (H, W, 3). Returns (crop_rgb, info_dict)."""
        H, W = rgb.shape[:2]
        ox = oy = 0
        img = rgb
        method_used = "full"

        # Optional ROI pre-crop (reduces detection area, speeds things up)
        if self.roi:
            x, y, w, h = self.roi
            x0, y0 = int(x * W), int(y * H)
            x1, y1 = int((x + w) * W), int((y + h) * H)
            img, ox, oy = rgb[y0:y1, x0:x1], x0, y0
            method_used = "roi"

        # Hand detection
        hands_px = self._hand_landmarks_px(img)
        n_hands = len(hands_px)
        bbox = None
        if hands_px:
            pts = np.array([p for h in hands_px for p in h], dtype=float)
            ih, iw = img.shape[:2]
            x0, x1 = pts[:, 0].min(), pts[:, 0].max()
            y0, y1 = pts[:, 1].min(), pts[:, 1].max()

            mx, my = (x1 - x0) * self.margin, (y1 - y0) * self.margin
            if n_hands == 1:
                # only one hand found: open the box more, the other is probably next to it
                mx *= 2.5

            x0, x1 = max(0.0, x0 - mx), min(iw, x1 + mx)
            y0, y1 = max(0.0, y0 - my), min(ih, y1 + my)

            bbox = (int(x0) + ox, int(y0) + oy, int(x1) + ox, int(y1) + oy)
            method_used = self.backend

        # Fallback: full frame
        if bbox is None:
            bbox = (ox, oy, ox + img.shape[1], oy + img.shape[0])

        x0, y0, x1, y1 = bbox
        crop = rgb[y0:y1, x0:x1]
        if crop.size == 0:
            crop, bbox = rgb, (0, 0, W, H)

        return crop, {
            "method": method_used,
            "hands_detected": n_hands,
            "bbox": list(map(int, bbox)),
        }