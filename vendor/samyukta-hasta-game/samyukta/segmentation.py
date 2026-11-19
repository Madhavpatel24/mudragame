"""Pure-numpy temporal logic: smoothing + turning frame predictions into mudra 'movements'."""
import numpy as np


def smooth_probs(P, window):
    P = np.asarray(P, dtype=float)
    window = int(window)
    if window <= 1 or len(P) == 0:
        return P
    if window % 2 == 0:
        window += 1
    pad = window // 2
    Pp = np.pad(P, ((pad, pad), (0, 0)), mode="edge")
    kern = np.ones(window) / window
    out = np.stack([np.convolve(Pp[:, c], kern, mode="valid") for c in range(P.shape[1])], axis=1)
    return out[: len(P)]


def find_movements(times, probs_smooth, frame_dt, min_conf, min_duration, gap_tolerance, hands=None):
    """Return list of (class_index, i0, i1) runs (inclusive frame indices)."""
    n = len(times)
    if n == 0:
        return []
    pred = probs_smooth.argmax(1)
    conf = probs_smooth.max(1)
    labels = [int(pred[i]) if conf[i] >= min_conf else None for i in range(n)]
    if hands is not None:
        labels = [None if hands[i] == 0 else labels[i] for i in range(n)]

    runs = []  # [label, i0, i1]
    for i, lab in enumerate(labels):
        if runs and runs[-1][0] == lab:
            runs[-1][2] = i
        else:
            runs.append([lab, i, i])

    for r in runs:  # drop short runs
        if r[0] is not None and (times[r[2]] - times[r[1]] + frame_dt) < min_duration:
            r[0] = None

    merged = []
    for r in runs:
        if r[0] is None:
            continue
        if merged and merged[-1][0] == r[0]:
            gap = times[r[1]] - times[merged[-1][2]] - frame_dt
            if gap <= gap_tolerance:
                merged[-1][2] = r[2]
                continue
        merged.append(list(r))
    return [(m[0], m[1], m[2]) for m in merged]
