"""Visual debugging of recognition: HTML report, probability timeline PNG and an annotated video.

Works on a saved teacher_reference.json or student_performance.json (no model needed).
    python run.py visualize --json outputs/teacher/teacher_reference.json
"""
import os
import html
import numpy as np
import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .utils import load_json
from .video import iter_frames

GREEN, RED, GREY = "#2e9e5b", "#d64545", "#9aa0a6"


def _rel(path, base):
    return os.path.relpath(os.path.abspath(path), os.path.abspath(base)).replace("\\", "/")


# ------------------------------------------------------------------------------------------- HTML
def build_html(doc, out_dir):
    mvs = doc["movements"]
    is_teacher = doc.get("video_type") == "teacher"
    frames = [f for m in mvs for f in m["frames"]]
    n = max(len(frames), 1)
    hands = {k: sum(1 for f in frames if min(f["hands_detected"], 2) == k) for k in (0, 1, 2)}
    methods = {}
    for f in frames:
        methods[f["crop_method"]] = methods.get(f["crop_method"], 0) + 1

    css = """body{font-family:system-ui,Segoe UI,Arial;margin:20px;background:#fafafa;color:#222}
    .card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:14px 0}
    .ok{border-left:6px solid #2e9e5b}.bad{border-left:6px solid #d64545}
    h3{margin:0 0 4px}.sub{color:#555;font-size:13px;margin-bottom:8px}
    .strip{display:flex;flex-wrap:wrap;gap:4px}.f{width:96px;font-size:10px;text-align:center}
    .f img{width:96px;height:96px;object-fit:contain;background:#222;border:3px solid;box-sizing:border-box}
    .bars div{display:flex;align-items:center;font-size:12px;margin:1px 0}.bars span{width:150px}
    .bars i{display:block;height:10px;background:#4a7bd0;margin-right:6px}
    .pill{display:inline-block;padding:1px 8px;border-radius:10px;color:#fff;font-size:12px}
    .legend span{margin-right:14px}"""
    out = [f"<html><head><meta charset='utf-8'><title>Recognition report</title><style>{css}</style></head><body>"]
    out.append(f"<h2>{doc['video_type'].title()} recognition - {html.escape(doc['video']['name'])}</h2>")
    summ = (f"{doc['summary'].get('classifier_agrees_with_segment', '-')}/{len(mvs)} movements where the classifier agrees with the segment label. "
            if is_teacher else f"{len(mvs)} movements found. ")
    out.append(f"<p><b>{summ}</b></p>")
    out.append(f"<p>Hands detected per frame - <b>2 hands: {hands[2] / n:.0%}</b>, 1 hand: {hands[1] / n:.0%}, none: {hands[0] / n:.0%}. "
               f"Crop method: {', '.join(f'{k} ({v / n:.0%})' for k, v in methods.items())}</p>")
    out.append("<p class='legend'><span style='color:#2e9e5b'>■ frame predicted = movement label</span>"
               "<span style='color:#d64545'>■ frame predicted something else</span><span>faded = transition part (ignored for the decision)</span></p>")
    out.append("<p>If 'none/1 hand' is high or the crops don't show both hands, fix the ROI / detection first - the classifier can't be judged yet.</p>")

    for m in mvs:
        label = m["label"]
        agree = m.get("classifier_agrees_with_segment", m["predicted_class"] == label)
        cls = "ok" if agree else "bad"
        badge = f"<span class='pill' style='background:{GREEN if agree else RED}'>{'agrees' if agree else 'DISAGREES'}</span>"
        title = f"{html.escape(m.get('segment_name', label))} &rarr; label <b>{html.escape(label)}</b>"
        out.append(f"<div class='card {cls}'><h3>#{m['movement_id']} {title} {badge}</h3>")
        out.append(f"<div class='sub'>{m['start_time']:.1f}s - {m['end_time']:.1f}s &nbsp; classifier says <b>{html.escape(m['predicted_class'])}</b>"
                   + (f" &nbsp; p(label)={m.get('expected_class_probability', 0):.2f}" if is_teacher else f" &nbsp; confidence {m['mean_confidence']:.2f}") + "</div>")
        top = sorted(m["probabilities"].items(), key=lambda kv: -kv[1])[:5]
        out.append("<div class='bars'>" + "".join(
            f"<div><span>{html.escape(k)}{' ★' if k == label else ''}</span><i style='width:{int(v * 220)}px'></i>{v:.2f}</div>" for k, v in top) + "</div>")
        out.append("<div class='strip'>")
        for f in m["frames"]:
            if not f.get("crop_path") or not os.path.exists(f["crop_path"]):
                continue
            ok = f["predicted_class"] == label
            op = 1.0 if f.get("stable", True) else 0.4
            tip = f"t={f['timestamp']}s pred={f['predicted_class']} {f['confidence']} hands={f['hands_detected']} ({f['crop_method']})"
            out.append(f"<div class='f' style='opacity:{op}' title='{html.escape(tip)}'><img src='{_rel(f['crop_path'], out_dir)}' "
                       f"style='border-color:{GREEN if ok else RED}'>{html.escape(f['predicted_class'][:9])}<br>{f['confidence']:.2f} · {f['hands_detected']}h</div>")
        out.append("</div></div>")
    out.append("</body></html>")
    path = os.path.join(out_dir, "visual_report.html")
    open(path, "w", encoding="utf-8").write("\n".join(out))
    return path


# ------------------------------------------------------------------------------------------- timeline
def build_timeline(doc, out_dir):
    mvs = doc["movements"]
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(16, 6), sharex=True, gridspec_kw={"height_ratios": [4, 1]})
    for m in mvs:
        agree = m.get("classifier_agrees_with_segment", m["predicted_class"] == m["label"])
        a1.axvspan(m["start_time"], m["end_time"], color=GREEN if agree else RED, alpha=0.10)
        t = [f["timestamp"] for f in m["frames"]]
        a1.plot(t, [f["probabilities"].get(m["label"], 0) for f in m["frames"]], color=GREEN, lw=1.6)
        a1.plot(t, [f["confidence"] for f in m["frames"]], color=GREY, lw=0.8)
        a1.text((m["start_time"] + m["end_time"]) / 2, 1.02, m["label"], rotation=90, ha="center", va="bottom", fontsize=7)
        a2.plot(t, [min(f["hands_detected"], 2) for f in m["frames"]], color="#4a7bd0", drawstyle="steps-post")
    a1.set_ylim(0, 1.0); a1.set_ylabel("probability")
    a1.set_title("green = p(label of this movement)   grey = confidence of whatever the classifier predicted   background: green=agrees, red=disagrees", fontsize=9, pad=70)
    a2.set_ylim(-0.2, 2.2); a2.set_yticks([0, 1, 2]); a2.set_ylabel("hands found"); a2.set_xlabel("time (s)")
    fig.tight_layout()
    path = os.path.join(out_dir, "visual_timeline.png")
    fig.savefig(path, dpi=130); plt.close(fig)
    return path


# ------------------------------------------------------------------------------------------- video
def annotate_video(cfg, json_path, out_mp4, video=None, roi=None, max_width=960):
    """Source video with the crop box, per-frame prediction and a picture-in-picture crop drawn on it."""
    doc = load_json(json_path)
    video_path = str(video or doc["video"]["path"])
    sf = doc["video"]["sample_fps"]
    lookup = {}
    for m in doc["movements"]:
        for f in m["frames"]:
            lookup[f["frame_index"]] = (m, f)
    st = doc.get("settings", {})
    roi = roi or st.get("roi_used") or (st.get("crop") or {}).get("roi")
    os.makedirs(os.path.dirname(os.path.abspath(out_mp4)), exist_ok=True)
    writer = None
    for idx, t, rgb in iter_frames(video_path, sf):
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        H, W = bgr.shape[:2]
        if roi:
            x, y, w, h = roi
            cv2.rectangle(bgr, (int(x * W), int(y * H)), (int((x + w) * W), int((y + h) * H)), (255, 128, 0), 2)
        info = lookup.get(idx)
        if info:
            m, f = info
            ok = f["predicted_class"] == m["label"]
            col = (80, 170, 50) if ok else (60, 60, 220)
            if f.get("bbox"):
                x0, y0, x1, y1 = f["bbox"]
                cv2.rectangle(bgr, (x0, y0), (x1, y1), col, 3)
            l1 = f"t={t:6.1f}s  label: {m['label']}"
            l2 = f"pred: {f['predicted_class']} {f['confidence']:.2f}   hands: {f['hands_detected']}  [{f['crop_method']}]"
            if f.get("crop_path") and os.path.exists(f["crop_path"]):
                c = cv2.imread(f["crop_path"]); sc = min(170, W // 3, H // 3) / max(c.shape[:2])
                c = cv2.resize(c, (max(1, int(c.shape[1] * sc)), max(1, int(c.shape[0] * sc))))
                bgr[8:8 + c.shape[0], W - c.shape[1] - 8:W - 8] = c
                cv2.rectangle(bgr, (W - c.shape[1] - 8, 8), (W - 8, 8 + c.shape[0]), col, 3)
        else:
            col, l1, l2 = (150, 150, 150), f"t={t:6.1f}s", "not in a movement / excluded segment"
        cv2.rectangle(bgr, (0, 0), (min(W, 640), 62), (0, 0, 0), -1)
        cv2.putText(bgr, l1, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(bgr, l2, (8, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2, cv2.LINE_AA)
        if W > max_width:
            bgr = cv2.resize(bgr, (max_width, int(H * max_width / W)))
        if writer is None:
            writer = cv2.VideoWriter(str(out_mp4), cv2.VideoWriter_fourcc(*"mp4v"), sf, (bgr.shape[1], bgr.shape[0]))
        writer.write(bgr)
    if writer:
        writer.release()
    return str(out_mp4)


# ------------------------------------------------------------------------------------------- contact sheet
def _tile(images, cols, pad=4, bg=(30, 30, 30)):
    rows = [images[i:i + cols] for i in range(0, len(images), cols)]
    h = max(i.shape[0] for i in images); w = max(i.shape[1] for i in images)
    sheet = np.full((len(rows) * (h + pad) + pad, cols * (w + pad) + pad, 3), bg, np.uint8)
    for r, row in enumerate(rows):
        for c, im in enumerate(row):
            y, x = pad + r * (h + pad), pad + c * (w + pad)
            sheet[y:y + im.shape[0], x:x + im.shape[1]] = im
    return sheet


def contact_sheet(json_path, out_png, cols=6, thumb=150):
    """One row per movement: evenly spaced crops, green border = frame agrees with the movement label."""
    doc = load_json(json_path)
    rows = []
    for m in doc["movements"]:
        stable = [f for f in m["frames"] if f.get("stable", True) and f.get("crop_path") and os.path.exists(f["crop_path"])]
        if not stable:
            continue
        pick = [stable[int(i)] for i in np.linspace(0, len(stable) - 1, min(cols, len(stable)))]
        cells = []
        for f in pick:
            im = cv2.imread(f["crop_path"]); s = thumb / max(im.shape[:2])
            im = cv2.resize(im, (max(1, int(im.shape[1] * s)), max(1, int(im.shape[0] * s))))
            cell = np.full((thumb + 30, thumb, 3), 30, np.uint8)
            cell[:im.shape[0], :im.shape[1]] = im
            col = (80, 170, 50) if f["predicted_class"] == m["label"] else (60, 60, 220)
            cv2.rectangle(cell, (0, 0), (thumb - 1, thumb - 1), col, 3)
            cv2.putText(cell, f"{f['predicted_class'][:12]} {f['confidence']:.2f}", (3, thumb + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(cell, f"hands {f['hands_detected']}", (3, thumb + 27), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (180, 180, 180), 1, cv2.LINE_AA)
            cells.append(cell)
        while len(cells) < cols:
            cells.append(np.full_like(cells[0], 30))
        rows.append(np.concatenate([_label_cell(m, thumb)] + cells, axis=1))
    if not rows:
        raise RuntimeError("No crops found - were crops saved next to the JSON, and are you running from the same folder?")
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    cv2.imwrite(str(out_png), np.concatenate(rows, axis=0))
    return str(out_png)


def _label_cell(m, thumb):
    cell = np.full((thumb + 30, 190, 3), 20, np.uint8)
    agree = m.get("classifier_agrees_with_segment", m["predicted_class"] == m["label"])
    cv2.putText(cell, f"#{m['movement_id']} {m['label'][:16]}", (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(cell, "classifier:", (6, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (170, 170, 170), 1, cv2.LINE_AA)
    cv2.putText(cell, m["predicted_class"][:18], (6, 72), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (80, 170, 50) if agree else (60, 60, 220), 1, cv2.LINE_AA)
    return cell


# ------------------------------------------------------------------------------------------- crop preview (no model needed)
def preview_crops(cfg, video, out_png, roi=None, n=12, start=None, end=None, cols=3, width=420):
    """Sample n frames, draw ROI (blue) and detected-hand box (green=2 hands, orange=1, red=none). Use to tune --roi."""
    from .pipeline import make_cropper
    from .video import video_info
    info = video_info(video)
    a, b = (start or 0.0), (end or info["duration"])
    cropper = make_cropper(cfg, roi)
    want = list(np.linspace(a, max(a, b - 0.1), n))
    shots, wi = [], 0
    for idx, t, rgb in iter_frames(video, 30.0, a, b):          # dense scan, keep the frame nearest each wanted time
        if wi < len(want) and t >= want[wi]:
            crop, meta = cropper(rgb)
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR); H, W = bgr.shape[:2]
            r = roi or cfg["crop"]["roi"]
            if r:
                cv2.rectangle(bgr, (int(r[0] * W), int(r[1] * H)), (int((r[0] + r[2]) * W), int((r[1] + r[3]) * H)), (255, 128, 0), 3)
            col = {2: (80, 170, 50), 1: (0, 140, 255)}.get(meta["hands_detected"], (60, 60, 220))
            x0, y0, x1, y1 = meta["bbox"]; cv2.rectangle(bgr, (x0, y0), (x1, y1), col, 4)
            cv2.putText(bgr, f"t={t:.1f}s hands={meta['hands_detected']} [{meta['method']}]", (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 3, cv2.LINE_AA)
            bgr = cv2.resize(bgr, (width, int(H * width / W)))
            shots.append(bgr); wi += 1
            while wi < len(want) and t >= want[wi]:
                wi += 1
    if not shots:
        raise RuntimeError("No frames read for preview")
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    cv2.imwrite(str(out_png), _tile(shots, cols))
    print(f"[preview] wrote {out_png}  (blue = ROI, green = 2 hands, orange = 1 hand, red = none found)")
    return str(out_png)


def build_all(json_path, with_video=True, video_path=None, roi=None, cfg=None):
    """HTML report + timeline + contact sheet (+ annotated video) next to the JSON."""
    doc = load_json(json_path)
    out_dir = os.path.dirname(os.path.abspath(json_path))
    if not any("bbox" in f for m in doc["movements"] for f in m["frames"][:1]):
        print("[visualize] NOTE: this JSON has no crop boxes (older version). Re-run the teacher/student command for full detail.")
    paths = [build_html(doc, out_dir), build_timeline(doc, out_dir), contact_sheet(json_path, os.path.join(out_dir, "contact_sheet.png"))]
    if with_video:
        paths.append(annotate_video(cfg, json_path, os.path.join(out_dir, "annotated.mp4"), video_path, roi))
    for p in paths:
        print("[visualize] wrote", p)
    return paths
