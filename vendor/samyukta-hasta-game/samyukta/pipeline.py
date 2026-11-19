"""Teacher / student recognition -> JSON, and comparison. The classifier is injected, so this file does not need torch."""
import os
import numpy as np
import cv2
from PIL import Image

from .video import iter_frames, video_info, effective_dt
from .hand_crop import HandCropper
from .labels import map_segments
from .segmentation import smooth_probs, find_movements
from .compare import compare_performances
from .report import plot_timeline
from .utils import save_json, load_json, now_iso, r4

SCHEMA = "1.0"


def make_cropper(cfg, roi_override=None):
    c = cfg["crop"]
    return HandCropper(c["method"], roi_override or c["roi"], c["margin"], c["min_detection_confidence"], c["hand_landmarker_model"])


def _warn_if_blind(cropper, roi):
    if cropper.backend == "none" and not roi:
        print("\n" + "!" * 78 + "\n[WARNING] No hand detector and no ROI: the WHOLE frame is classified, so results will be mostly wrong.\n"
              "  1) python scripts/download_hand_model.py   (enables MediaPipe), and/or\n"
              "  2) python run.py preview --roi x,y,w,h     (check where the hands are), then rerun with --roi\n" + "!" * 78 + "\n")


def recognize_video(video, clf, cropper, sample_fps, crops_dir=None, start=None, end=None, batch=32):
    """Run crop + classifier on sampled frames. Returns dict(times, probs, emb, meta list, crop_paths)."""
    times, metas, paths, probs, embs, buf = [], [], [], [], [], []
    if crops_dir:
        os.makedirs(crops_dir, exist_ok=True)

    def flush():
        if buf:
            p, e = clf.predict(buf, batch)
            probs.append(p); embs.append(e); buf.clear()

    for idx, t, rgb in iter_frames(video, sample_fps, start, end):
        crop, meta = cropper(rgb)
        meta["frame_index"] = idx
        if crops_dir:
            h, w = crop.shape[:2]; sc = min(1.0, 320 / max(h, w))
            small = cv2.resize(crop, (max(1, int(w * sc)), max(1, int(h * sc))))
            pth = os.path.join(crops_dir, f"frame_{idx:06d}.jpg")
            cv2.imwrite(pth, cv2.cvtColor(small, cv2.COLOR_RGB2BGR)); paths.append(pth)
        else:
            paths.append(None)
        buf.append(Image.fromarray(crop)); times.append(t); metas.append(meta)
        if len(buf) >= batch:
            flush()
            print(f"\r[recognize] {len(times)} frames  t={t:6.1f}s", end="", flush=True)
    flush(); print()
    if not times:
        raise RuntimeError("No frames were read from the video.")
    return {"times": np.array(times), "probs": np.concatenate(probs), "emb": np.concatenate(embs), "metas": metas, "paths": paths}


def _frame_record(i, rec, class_names, stable=True):
    p = rec["probs"][i]; k = int(p.argmax()); m = rec["metas"][i]
    top = np.argsort(-p)[:3]
    return {"frame_index": m["frame_index"], "timestamp": r4(rec["times"][i]), "predicted_class": class_names[k],
            "confidence": r4(p[k]), "top3": [{"class": class_names[j], "prob": r4(p[j])} for j in top],
            "probabilities": {c: r4(p[j]) for j, c in enumerate(class_names)},
            "hands_detected": m["hands_detected"], "crop_method": m["method"], "bbox": m["bbox"], "crop_path": rec["paths"][i], "stable": bool(stable)}


def _video_block(video, sample_fps):
    inf = video_info(video)
    return {"name": os.path.basename(str(video)), "path": str(video), "duration": r4(inf["duration"]), "native_fps": r4(inf["fps"]),
            "width": inf["width"], "height": inf["height"], "sample_fps": sample_fps}


def _movement_stats(rec, idxs, class_names, stable_mask=None):
    sel = [i for k, i in enumerate(idxs) if stable_mask is None or stable_mask[k]] or list(idxs)
    mp = rec["probs"][sel].mean(0)
    return mp, rec["emb"][sel].mean(0)


# ----------------------------------------------------------------------------- teacher
def run_teacher(cfg, clf, video, segments_path, out_dir, roi=None, label_source=None):
    tc = cfg["teacher"]; sf = cfg["video"]["sample_fps"]
    label_source = label_source or tc["label_source"]
    class_names = clf.class_names
    segs = load_json(segments_path)["segments"]
    mapped, excluded = map_segments(segs, class_names, tc["aliases"], tc["match_cutoff"])
    print(f"[teacher] {len(mapped)} segments mapped to dataset classes, {len(excluded)} excluded: {[e['name'] for e in excluded]}")

    cropper = make_cropper(cfg, roi)
    _warn_if_blind(cropper, roi or cfg["crop"]["roi"])
    rec = recognize_video(video, clf, cropper, sf, os.path.join(out_dir, "crops"))
    movements, agree = [], 0
    for k, seg in enumerate(mapped, 1):
        a, b = seg["start"], seg["end"]
        idxs = [i for i, t in enumerate(rec["times"]) if a <= t < b]
        if not idxs:
            print(f"[teacher] WARNING no frames for segment {seg['name']}"); continue
        cut = a + tc["skip_start_fraction"] * (b - a)
        stable = [rec["times"][i] >= cut for i in idxs]
        mp, me = _movement_stats(rec, idxs, class_names, stable)
        pred = class_names[int(mp.argmax())]; exp = seg["expected_class"]
        agree += pred == exp
        movements.append({
            "movement_id": k, "segment_id": seg["id"], "segment_name": seg["name"], "meaning": seg.get("meaning"),
            "expected_class": exp, "predicted_class": pred, "classifier_agrees_with_segment": pred == exp,
            "label": exp if label_source == "segment" else pred, "label_source": label_source,
            "expected_class_probability": r4(mp[class_names.index(exp)]), "mean_confidence": r4(mp.max()),
            "start_time": a, "end_time": b, "duration": r4(b - a), "stable_window_start": r4(cut),
            "frame_count": len(idxs), "probabilities": {c: r4(mp[j]) for j, c in enumerate(class_names)},
            "embedding_mean": [r4(v) for v in me], "name_match_score": seg["match_score"],
            "frames": [_frame_record(i, rec, class_names, s) for i, s in zip(idxs, stable)]})
    doc = {"schema_version": SCHEMA, "video_type": "teacher", "created_at": now_iso(), "video": _video_block(video, sf),
           "model": {"version": clf.version}, "class_names": class_names, "settings": {"label_source": label_source, "crop": cfg["crop"], "roi_used": roi or cfg["crop"]["roi"], "skip_start_fraction": tc["skip_start_fraction"]},
           "summary": {"movements": len(movements), "classifier_agrees_with_segment": int(agree),
                       "agreement_rate": r4(agree / max(len(movements), 1))},
           "excluded_segments": [{"id": e["id"], "name": e["name"], "reason": e["reason"]} for e in excluded], "movements": movements}
    path = save_json(doc, os.path.join(out_dir, "teacher_reference.json"))
    print(f"[teacher] classifier agrees with segment labels on {agree}/{len(movements)} movements -> {path}")
    for m in movements:
        if not m["classifier_agrees_with_segment"]:
            print(f"   disagreement: segment '{m['segment_name']}' expected {m['expected_class']} but classifier says {m['predicted_class']} (p_expected={m['expected_class_probability']})")
    return doc


# ----------------------------------------------------------------------------- student
def run_student(cfg, clf, video, out_dir, roi=None, start=None, end=None):
    sc = cfg["student"]; sf = cfg["video"]["sample_fps"]
    class_names = clf.class_names
    cropper = make_cropper(cfg, roi)
    _warn_if_blind(cropper, roi or cfg["crop"]["roi"])
    rec = recognize_video(video, clf, cropper, sf, os.path.join(out_dir, "crops"), start, end)
    dt = effective_dt(video, sf)
    ps = smooth_probs(rec["probs"], sc["smooth_window"])
    hands = [m["hands_detected"] for m in rec["metas"]] if cfg["crop"]["method"] == "mediapipe" and \
        any(m["hands_detected"] for m in rec["metas"]) else None   # only veto frames if detection actually works
    runs = find_movements(rec["times"], ps, dt, sc["min_confidence"], sc["min_duration"], sc["gap_tolerance"], hands)
    movements = []
    for k, (cls, i0, i1) in enumerate(runs, 1):
        idxs = list(range(i0, i1 + 1))
        mp, me = _movement_stats(rec, idxs, class_names)
        movements.append({
            "movement_id": k, "label": class_names[cls], "predicted_class": class_names[cls],
            "mean_confidence": r4(mp[cls]), "start_time": r4(rec["times"][i0]), "end_time": r4(rec["times"][i1] + dt),
            "duration": r4(rec["times"][i1] + dt - rec["times"][i0]), "frame_count": len(idxs),
            "probabilities": {c: r4(mp[j]) for j, c in enumerate(class_names)}, "embedding_mean": [r4(v) for v in me],
            "frames": [_frame_record(i, rec, class_names) for i in idxs]})
    doc = {"schema_version": SCHEMA, "video_type": "student", "created_at": now_iso(), "video": _video_block(video, sf),
           "model": {"version": clf.version}, "class_names": class_names,
           "settings": {"crop": cfg["crop"], "roi_used": roi or cfg["crop"]["roi"], **sc}, "summary": {"movements": len(movements), "frames_analysed": len(rec["times"]),
           "frames_in_movements": sum(m["frame_count"] for m in movements)}, "movements": movements}
    path = save_json(doc, os.path.join(out_dir, "student_performance.json"))
    print(f"[student] {len(movements)} movements -> {path}")
    print("   sequence:", " > ".join(m["label"] for m in movements))
    return doc


# ----------------------------------------------------------------------------- compare
def run_compare(cfg, teacher_json, student_json, out_dir):
    teacher, student = load_json(teacher_json), load_json(student_json)
    rep = compare_performances(teacher, student, cfg)
    save_json(rep, os.path.join(out_dir, "comparison_report.json"))
    plot_timeline(teacher, student, rep, os.path.join(out_dir, "comparison_timeline.png"))
    s = rep["summary"]
    print(f"\n=== OVERALL SCORE {s['overall_score']:.1f}/100 | correct {s['correct']}/{s['teacher_movements']} "
          f"| wrong {s['wrong_mudra']} | missing {s['missing']} | extra {s['extra']} ===")
    print("\n".join("  - " + f for f in rep["feedback"]))
    print(f"[compare] saved to {out_dir}")
    return rep
