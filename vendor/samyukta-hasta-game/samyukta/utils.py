import json
import copy
import datetime as _dt
from pathlib import Path

import yaml

DEFAULT_CONFIG = {
    "paths": {
        "dataset_root": "data/samyukta",
        "outputs": "outputs",
        "teacher_video": "reference/samyukta_hasta.mp4",
        "teacher_segments": "reference/teacher_segments.json",
    },
    "dataset": {
        # Only images whose path contains this text are used (the dataset has single- and double-hand classes).
        # Leave "" to disable. The HF export script writes data/samyukta/<Class>/*.jpg (double-hand only).
        "double_hand_path_hint": "double",
        # Optional text file, one class name per line, to restrict classes explicitly.
        "classes_file": "",
        "val_fraction": 0.15,
        "test_fraction": 0.15,
        # Optional regex with ONE group extracting the volunteer id from the file name,
        # e.g. "vol(\\d+)". Enables volunteer-disjoint splits (recommended; honest accuracy).
        "group_regex": "",
        "seed": 42,
    },
    "train": {
        "img_size": 224,
        "batch_size": 32,
        "epochs_head": 3,
        "epochs_finetune": 12,
        "lr_head": 1e-3,
        "lr_finetune": 2e-4,
        "weight_decay": 1e-4,
        "label_smoothing": 0.1,
        "dropout": 0.3,
        "patience": 4,
        "num_workers": 4,
        "pretrained": True,
    },
    "video": {"sample_fps": 6.0},
    "crop": {
        # mediapipe | roi | full
        "method": "mediapipe",
        # normalised [x, y, w, h] of the area where the dancer's hands move (applied before hand detection)
        "roi": None,
        "margin": 0.35,
        "min_detection_confidence": 0.3,
        # only needed when your mediapipe version has no mp.solutions (>=0.10.3x). See README.
        "hand_landmarker_model": "hand_landmarker.task",
    },
    "teacher": {
        # skip the first part of each segment: the pose is still forming while the title fades in
        "skip_start_fraction": 0.25,
        # "segment" = human-given label is the reference; "classifier" = trust the classifier
        "label_source": "segment",
        "match_cutoff": 0.8,
        # segment name -> class name (or null to force exclusion). Overrides fuzzy matching.
        "aliases": {"Dola": None, "Utsanga": None},
    },
    "student": {
        "smooth_window": 5,
        "min_confidence": 0.45,
        "min_duration": 1.0,
        "gap_tolerance": 1.0,
    },
    "compare": {
        "mismatch_cost": 1.0,
        "gap_cost": 0.75,
        "start_tolerance_sec": 2.5,
        "duration_zero_at": 2.0,
        "config_cosine_floor": 0.5,
        "weights": {"label": 0.5, "timing": 0.2, "duration": 0.15, "config": 0.15},
        "extra_penalty": 2.0,
        "extra_penalty_cap": 10.0,
        "dtw_stride": 2,
    },
}


def deep_merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path=None):
    user = {}
    if path and Path(path).exists():
        with open(path, "r", encoding="utf-8") as f:
            user = yaml.safe_load(f) or {}
    return deep_merge(DEFAULT_CONFIG, user)


def save_json(obj, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    return str(path)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def now_iso():
    return _dt.datetime.now().replace(microsecond=0).isoformat()


def r4(x):
    return round(float(x), 4)
