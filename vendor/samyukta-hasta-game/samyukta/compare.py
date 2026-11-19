"""Teacher-vs-student comparison. Pure numpy, works only on the saved JSON files (no model needed)."""
import math
import numpy as np

from .utils import now_iso, r4


# ----------------------------------------------------------------------------- alignment
def align_sequences(t_labels, s_labels, mismatch=1.0, gap=0.75):
    """Needleman-Wunsch. Returns list of (teacher_idx|None, student_idx|None)."""
    n, m = len(t_labels), len(s_labels)
    D = np.zeros((n + 1, m + 1))
    D[:, 0] = np.arange(n + 1) * gap
    D[0, :] = np.arange(m + 1) * gap
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = 0.0 if t_labels[i - 1] == s_labels[j - 1] else mismatch
            D[i, j] = min(D[i - 1, j - 1] + sub, D[i - 1, j] + gap, D[i, j - 1] + gap)
    i, j, pairs = n, m, []
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            sub = 0.0 if t_labels[i - 1] == s_labels[j - 1] else mismatch
            if abs(D[i, j] - (D[i - 1, j - 1] + sub)) < 1e-9:
                pairs.append((i - 1, j - 1)); i -= 1; j -= 1; continue
        if i > 0 and abs(D[i, j] - (D[i - 1, j] + gap)) < 1e-9:
            pairs.append((i - 1, None)); i -= 1; continue
        pairs.append((None, j - 1)); j -= 1
    return pairs[::-1]


def dtw(cost):
    n, m = cost.shape
    D = np.full((n + 1, m + 1), np.inf)
    D[0, 0] = 0.0
    for i in range(1, n + 1):
        row, prev, c = D[i], D[i - 1], cost[i - 1]
        for j in range(1, m + 1):
            row[j] = c[j - 1] + min(prev[j], row[j - 1], prev[j - 1])
    i, j, total, steps = n, m, 0.0, 0
    while i > 0 and j > 0:
        total += cost[i - 1, j - 1]; steps += 1
        k = int(np.argmin([D[i - 1, j - 1], D[i - 1, j], D[i, j - 1]]))
        if k == 0: i -= 1; j -= 1
        elif k == 1: i -= 1
        else: j -= 1
    return total / max(steps, 1)


# ----------------------------------------------------------------------------- helpers
def _frame_matrix(movements, class_names):
    rows = []
    for mv in movements:
        for fr in mv.get("frames", []):
            if fr.get("stable", True):
                rows.append([fr["probabilities"].get(c, 0.0) for c in class_names])
    return np.asarray(rows, dtype=float)


def _cos(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / d) if d > 0 else 0.0


def _mean_prob_for(mv, cls):
    vals = [fr["probabilities"].get(cls, 0.0) for fr in mv.get("frames", []) if fr.get("stable", True)]
    return float(np.mean(vals)) if vals else 0.0


# ----------------------------------------------------------------------------- main
def compare_performances(teacher, student, cfg):
    cc = cfg["compare"]
    w = cc["weights"]
    class_names = teacher.get("class_names") or student.get("class_names")
    T, S = teacher["movements"], student["movements"]
    pairs = align_sequences([m["label"] for m in T], [m["label"] for m in S], cc["mismatch_cost"], cc["gap_cost"])

    correct = [(i, j) for i, j in pairs if i is not None and j is not None and T[i]["label"] == S[j]["label"]]

    # global tempo = median duration ratio over correctly matched mudras (robust to missing/extra ones)
    ratios = [(S[j]["end_time"] - S[j]["start_time"]) / (T[i]["end_time"] - T[i]["start_time"])
              for i, j in correct if T[i]["end_time"] > T[i]["start_time"]]
    tempo = float(np.median(ratios)) if ratios else 1.0

    rows, extras, feedback = [], [], []
    prev_ok = None  # previous pair if it was correct (adjacent in the alignment)
    for i, j in pairs:
        if i is not None and j is None:
            t = T[i]
            prev_ok = None
            rows.append({"teacher_movement_id": t["movement_id"], "teacher_label": t["label"], "student_movement_id": None,
                         "student_label": None, "status": "missing", "score": 0.0})
            feedback.append(f"{t['label']}: missing in the student's performance.")
        elif i is None:
            s = S[j]
            prev_ok = None
            extras.append({"student_movement_id": s["movement_id"], "student_label": s["label"],
                           "start_time": s["start_time"], "end_time": s["end_time"]})
            feedback.append(f"Extra mudra '{s['label']}' at {s['start_time']:.1f}s was not in the reference.")
        else:
            t, s = T[i], S[j]
            row = {"teacher_movement_id": t["movement_id"], "teacher_label": t["label"],
                   "student_movement_id": s["movement_id"], "student_label": s["label"],
                   "teacher_start": t["start_time"], "teacher_end": t["end_time"],
                   "student_start": s["start_time"], "student_end": s["end_time"],
                   "student_confidence": s.get("mean_confidence"),
                   "student_prob_of_teacher_label": r4(_mean_prob_for(s, t["label"]))}
            if t["label"] != s["label"]:
                prev_ok = None
                row.update(status="wrong_mudra", score=0.0)
                feedback.append(f"{t['label']}: performed as {s['label']} "
                                f"(confidence {s.get('mean_confidence', 0):.2f}).")
            else:
                t_dur, s_dur = t["end_time"] - t["start_time"], s["end_time"] - s["start_time"]
                ratio = (s_dur / t_dur) / tempo if t_dur > 0 and tempo > 0 else 1.0
                start_err, timing = None, None
                if prev_ok is not None:   # timing only judged relative to the previous, adjacent, correct mudra
                    pi, pj = prev_ok
                    start_err = (s["start_time"] - S[pj]["start_time"]) - (t["start_time"] - T[pi]["start_time"]) * tempo
                    timing = max(0.0, 1 - abs(start_err) / cc["start_tolerance_sec"])
                duration = max(0.0, 1 - abs(math.log(max(ratio, 1e-3))) / math.log(cc["duration_zero_at"]))
                cos = _cos(t["embedding_mean"], s["embedding_mean"]) if t.get("embedding_mean") and s.get("embedding_mean") else None
                floor = cc["config_cosine_floor"]
                config = None if cos is None else max(0.0, min(1.0, (cos - floor) / (1 - floor)))
                comps = {"duration": duration, "timing": timing, "config": config}
                avail = {k: v for k, v in comps.items() if v is not None}   # unassessed parts are left out, weights renormalised
                num = w["label"] + sum(w[k] * v for k, v in avail.items())
                den = w["label"] + sum(w[k] for k in avail)
                score = 100 * num / den
                prev_ok = (i, j)
                row.update(status="correct", start_error_sec=None if start_err is None else r4(start_err),
                           duration_ratio_tempo_adjusted=r4(ratio),
                           timing_score=None if timing is None else r4(timing), duration_score=r4(duration),
                           hand_config_cosine=None if cos is None else r4(cos),
                           hand_config_score=None if config is None else r4(config), score=r4(score))
                msgs = []
                if start_err is not None and start_err > 0.5 * cc["start_tolerance_sec"]: msgs.append(f"started {start_err:.1f}s late")
                if start_err is not None and start_err < -0.5 * cc["start_tolerance_sec"]: msgs.append(f"started {-start_err:.1f}s early")
                if ratio < 0.75: msgs.append("held too short")
                if ratio > 1.33: msgs.append("held too long")
                if config is not None and config < 0.5: msgs.append("hand shape differs from the teacher's")
                feedback.append(f"{t['label']}: correct" + (" but " + ", ".join(msgs) if msgs else ", well done") + ".")
            rows.append(row)

    n_t = len(T)
    n_correct = sum(1 for r in rows if r["status"] == "correct")
    mean_move = float(np.mean([r["score"] for r in rows])) if rows else 0.0
    penalty = min(cc["extra_penalty"] * len(extras), cc["extra_penalty_cap"])
    overall = max(0.0, mean_move - penalty)

    dtw_sim = None
    A, B = _frame_matrix(T, class_names), _frame_matrix(S, class_names)
    if len(A) and len(B):
        st = max(1, int(cc["dtw_stride"]))
        A, B = A[::st], B[::st]
        cost = np.stack([0.5 * np.abs(B - a).sum(1) for a in A])
        dtw_sim = r4(1 - dtw(cost))

    return {
        "schema_version": "1.0", "created_at": now_iso(),
        "teacher_video": teacher["video"]["name"], "student_video": student["video"]["name"],
        "teacher_model": teacher["model"]["version"], "student_model": student["model"]["version"],
        "summary": {
            "overall_score": r4(overall),
            "teacher_movements": n_t, "student_movements": len(S),
            "correct": n_correct,
            "wrong_mudra": sum(1 for r in rows if r["status"] == "wrong_mudra"),
            "missing": sum(1 for r in rows if r["status"] == "missing"),
            "extra": len(extras),
            "mudra_accuracy": r4(n_correct / n_t) if n_t else None,
            "tempo_ratio_student_over_teacher": r4(tempo),
            "frame_dtw_similarity": dtw_sim,
            "extra_penalty": r4(penalty),
            "note": "hand_config_* is an embedding-cosine proxy; replace with 3D joint geometry for finger-level feedback.",
        },
        "movements": rows, "extra_student_movements": extras, "feedback": feedback,
    }
