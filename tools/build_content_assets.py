"""Builds the photos and the "looks like" tables for the game, for both modes.

For every mudra it
  1. picks one clear, typical photo from the Bharatanatyam Mudra Dataset (CC BY-SA 4.0), for Samyukta,
  2. removes the green studio background and puts the hands on black,
  3. runs the mode's own model over sample photos to see which mudras get mixed up.

Run:  python tools/build_content_assets.py <dataset folder>
Writes game/public/mudras/<mode>/<id>.jpg and game/lib/content/generated/<mode>.json
The sampled photos come from the data the models were trained on, so the accuracy numbers are
optimistic. They are used only to order and group mudras, never shown as the model's accuracy.
"""
import json
import os
import pickle
import re
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DATASET = Path(sys.argv[1])
SAMPLES = 25
OFF, RAMP = 8.0, 28.0  # green-screen thresholds (same as the Learn tab photos)

SAMYUKTA = ["Anjali", "Berunda", "Chakra", "Garuda", "Kapotham", "Karkatta", "Kartariswastika", "Katakavardhana",
            "Khatva", "Kilaka", "Kurma", "Matsya", "Nagabandha", "Pasha", "Pushpaputa", "Sakata", "Samputa", "Shanka",
            "Shivalinga", "Swastikam", "Varaha"]

# model class -> dataset folder, where the spelling differs
ASAMYUKTA = {
    "Alapadma": "Alapadmam(1)", "Arala": "Aralam(1)", "Ardhachandra": "Ardhachandran(1)",
    "Ardhapathaka": "Ardhapathaka(1)", "Chandrakala": "Chandrakala(1)", "Hamsasya": "Hamsasyam(1)",
    "Kapittha": "Kapith(1)", "Kartarimukha": "Katrimukha(1)", "Mayura": "Mayura(1)", "Mukula": "Mukulam(1)",
    "Mushti": "Mushti(1)", "Pathaka": "Pathaka(1)", "Sarpashirsha": "Sarpasirsha(1)", "Shikhara": "Sikharam(1)",
    "Shukatunda": "Shukatundam(1)", "Simhamukha": "Simhamukham(1)", "Suchi": "Suchi(1)",
    "Tamrachuda": "Tamarachudam(1)", "Tripathaka": "Tripathaka(1)", "Trishula": "Trishulam(1)",
}


def natural(name):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", name)]


def sample_files(folder):
    files = sorted((f for f in os.listdir(folder) if f.lower().endswith((".jpg", ".jpeg", ".png"))), key=natural)
    step = max(1, len(files) // SAMPLES)  # spread across the volunteers
    return [folder / f for f in files[::step][:SAMPLES]]


def cut_to_black(path, size):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype("float32")
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = np.clip((g - np.maximum(r, b) - OFF) / RAMP, 0, 1)
    green = np.asarray(Image.fromarray((green * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.8))).astype("float32") / 255
    a2 = a.copy()
    a2[..., 1] = np.minimum(g, (r + b) / 2 + 4)  # remove green spill on the skin
    fg = Image.fromarray(np.clip(a2, 0, 255).astype("uint8"))
    h = im.size[1]
    t = np.linspace(0, 1, h)[:, None, None]
    bg = Image.fromarray((np.array((22, 18, 14))[None, None, :] * (1 - t) + np.array((6, 5, 4))[None, None, :] * t).repeat(im.size[0], axis=1).astype("uint8"))
    out = Image.composite(fg, bg, Image.fromarray(((1 - green) * 255).astype("uint8")))
    return out.resize(size, Image.LANCZOS)


def summarise(classes, rows):
    """rows: list of (true_class, probs over `classes`, shape vector). Returns the per-class stats.

    Look-alikes come from how close two mudras are in shape: the average shape vector of each mudra is
    compared with the others (after scaling every number to the same range). The nearest ones that are
    clearly closer than a typical pair are listed, with `share` = 1 for identical and 0 for typical.
    """
    idx = {c: i for i, c in enumerate(classes)}
    X = np.array([v for _, _, v in rows], dtype=float)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    cents = {}
    for c in classes:
        mine = [v for t, _, v in rows if t == c]
        if mine:
            cents[c] = ((np.array(mine) - mu) / sd).mean(0)
    names = list(cents)
    D = np.array([[np.linalg.norm(cents[a] - cents[b]) for b in names] for a in names])
    typical = float(np.median(D[np.triu_indices(len(names), 1)]))
    close = float(np.percentile(D[np.triu_indices(len(names), 1)], 15))
    out = {}
    for c in classes:
        mine = [p for t, p, _ in rows if t == c]
        if not mine:
            continue
        P = np.array(mine)
        correct = float((P.argmax(1) == idx[c]).mean())
        i = names.index(c)
        near = sorted((float(D[i, j]), names[j]) for j in range(len(names)) if j != i)
        out[c] = {
            "sampleAccuracy": round(correct, 3),
            "meanProb": round(float(P[:, idx[c]].mean()), 3),
            "lookalikes": [{"id": k, "share": round(max(0.0, 1 - d / typical), 3)} for d, k in near[:2] if d <= close],
        }
    return out


def write(mode, photos_dir, data):
    out = ROOT / "game" / "lib" / "content" / "generated"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{mode}.json").write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- Samyukta (Aparna's model, unchanged)
def samyukta():
    vendor = ROOT / "vendor" / "samyukta-hasta-game"
    sys.path.insert(0, str(vendor))
    from samyukta.hand_crop import HandCropper
    from samyukta.infer import MudraClassifier

    clf = MudraClassifier(str(vendor / "outputs" / "model" / "model.pt"))
    cropper = HandCropper(method="mediapipe", margin=0.35, min_conf=0.3, landmarker_model=str(vendor / "hand_landmarker.task"))
    names = clf.class_names
    photos = ROOT / "game" / "public" / "mudras" / "samyukta"
    photos.mkdir(parents=True, exist_ok=True)

    rows, best = [], {}
    for c in SAMYUKTA:
        folder = DATASET / f"{c}(1)"
        for f in sample_files(folder):
            rgb = np.asarray(Image.open(f).convert("RGB"))
            crop, info = cropper(rgb)
            probs, embs = clf.predict([crop])
            p = probs[0]
            rows.append((c, p, embs[0]))
            ok = int(p.argmax()) == names.index(c) and info.get("hands_detected") == 2
            score = float(p[names.index(c)]) if ok else -1
            if score > best.get(c, (-2, None))[0]:
                best[c] = (score, f)
        print("samyukta", c, "done", flush=True)

    stats = summarise(names, rows)
    for c in SAMYUKTA:
        src = best[c][1] or sample_files(DATASET / f"{c}(1)")[0]
        cut_to_black(src, (800, 600)).save(photos / f"{c.lower()}.jpg", quality=86, optimize=True)
        stats[c]["photo"] = f"/mudras/samyukta/{c.lower()}.jpg"
        stats[c]["photoSource"] = src.name
    write("samyukta", photos, stats)


# ---------------------------------------------------------------- Asamyukta (NrityaNetra model, unchanged)
def asamyukta():
    work = Path(tempfile.mkdtemp())
    shutil.copy(ROOT / "asamyukta" / "mudra_model.pkl", work / "mudra_model.pkl")
    shutil.copy(ROOT / "vendor" / "samyukta-hasta-game" / "hand_landmarker.task", work / "hand_landmarker.task")
    sys.path.insert(0, str(ROOT / "asamyukta"))
    os.chdir(work)  # main.py loads its files from the current folder
    import cv2
    import main as nrityanetra  # importing builds the app but does not start a server

    classes = [str(c) for c in nrityanetra.label_encoder.classes_]
    photos = ROOT / "game" / "public" / "mudras" / "asamyukta"
    photos.mkdir(parents=True, exist_ok=True)

    rows = []
    for c, folder_name in ASAMYUKTA.items():
        for f in sample_files(DATASET / folder_name):
            feats = nrityanetra.extract_mudra_features(cv2.imread(str(f)))
            if feats is None:
                continue
            rows.append((c, nrityanetra.classifier.predict_proba(feats.reshape(1, -1))[0], feats))
        print("asamyukta", c, "done", flush=True)

    stats = summarise(classes, rows)
    # The Asamyukta drawings are made by tools/prepare_illustrations.py into game/public/mudras/asamyukta/;
    # this script only measures the look-alikes and must not overwrite them.
    # Samdamsha has no photos in the dataset, so it cannot be measured: it gets cautious defaults.
    stats["Samdamsha"] = {"sampleAccuracy": 0.4, "meanProb": 0.4, "lookalikes": [{"id": "Mukula", "share": 0.3}]}
    for c in stats:
        if (photos / f"{c.lower()}.jpg").exists():
            stats[c]["photo"] = f"/mudras/asamyukta/{c.lower()}.jpg"
    write("asamyukta", photos, stats)


if __name__ == "__main__":
    which = sys.argv[2] if len(sys.argv) > 2 else "both"
    if which in ("both", "samyukta"):
        samyukta()
    if which in ("both", "asamyukta"):
        asamyukta()
    print("done")
