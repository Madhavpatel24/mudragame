"""Runs without torch/dataset: tests label matching, segmentation, comparison on synthetic JSON."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import numpy as np

from samyukta.labels import map_segments
from samyukta.segmentation import smooth_probs, find_movements
from samyukta.compare import compare_performances
from samyukta.utils import load_config, load_json
from samyukta.report import plot_timeline

CLASSES = ["Anjali", "Kapotham", "Karkatta", "Swastikam", "Pushpaputam", "Shivalingam", "Katakavardhana",
           "Kartariawastika", "Sakata", "Shanka", "Chakra", "Samputa", "Pasam", "Keelakam", "Matsya", "Kurma",
           "Varaha", "Garuda", "Nagabandha", "Khatva", "Berunda"]


def test_labels():
    cfg = load_config()
    segs = load_json(pathlib.Path(__file__).resolve().parents[1] / "reference/teacher_segments.json")["segments"]
    mapped, excluded = map_segments(segs, CLASSES, cfg["teacher"]["aliases"], cfg["teacher"]["match_cutoff"])
    got = {m["name"]: m["expected_class"] for m in mapped}
    print(got); print([e["name"] for e in excluded])
    assert len(mapped) == 21 and sorted(e["name"] for e in excluded) == ["Dola", "Utsanga"]
    assert got["Angali"] == "Anjali" and got["Bherundha"] == "Berunda" and got["Koorma"] == "Kurma"
    assert len(set(got.values())) == 21


def fake_perf(kind, seq, rng, tempo=1.0, offset=0.0, dur=6.0, emb_noise=0.05):
    C = CLASSES
    base = {c: rng.normal(size=64) for c in C}
    mv, t = [], offset
    for k, lab in enumerate(seq):
        frames = []
        n = int(dur * tempo * 6)
        for f in range(n):
            p = np.full(len(C), 0.01); p[C.index(lab)] = 0.8; p /= p.sum()
            frames.append({"timestamp": t + f / 6, "probabilities": {c: float(p[i]) for i, c in enumerate(C)}, "stable": True})
        e = base[lab] + rng.normal(scale=emb_noise, size=64)
        mv.append({"movement_id": k + 1, "label": lab, "start_time": t, "end_time": t + dur * tempo,
                   "mean_confidence": 0.8, "embedding_mean": e.tolist(), "frames": frames})
        t += dur * tempo + 0.3
    return {"video": {"name": kind}, "model": {"version": "test"}, "class_names": C, "movements": mv}


def test_compare():
    rng = np.random.default_rng(0)
    seq = CLASSES[:8]
    teacher = fake_perf("teacher", seq, rng)
    # same bases needed for embeddings -> reuse seed
    rng = np.random.default_rng(0)
    student_seq = list(seq); student_seq[2] = "Chakra"; del student_seq[5]; student_seq.insert(6, "Garuda")
    student = fake_perf("student", student_seq, rng, tempo=1.3, offset=2.0)
    rep = compare_performances(teacher, student, load_config())
    s = rep["summary"]; print(s); print("\n".join(rep["feedback"]))
    assert s["wrong_mudra"] == 1 and s["missing"] == 1 and s["extra"] == 1 and s["correct"] == 6
    assert abs(s["tempo_ratio_student_over_teacher"] - 1.3) < 0.1
    good = compare_performances(teacher, fake_perf("student", seq, np.random.default_rng(0), tempo=1.0, offset=1.0), load_config())
    print("perfect-ish score:", good["summary"]["overall_score"])
    assert good["summary"]["overall_score"] > 90 and good["summary"]["correct"] == 8
    plot_timeline(teacher, student, rep, "/tmp/timeline_test.png")


def test_segmentation():
    C = 5; rng = np.random.default_rng(1)
    labels = [0] * 20 + [1] * 3 + [2] * 20 + [2] * 2 + [3] * 20   # short blip of class 1
    P = np.full((len(labels), C), 0.02)
    for i, l in enumerate(labels): P[i, l] = 0.9
    P += rng.normal(scale=0.02, size=P.shape); P = np.clip(P, 0, None); P /= P.sum(1, keepdims=True)
    times = np.arange(len(labels)) / 6
    runs = find_movements(times, smooth_probs(P, 5), 1 / 6, 0.45, 1.0, 1.0)
    print(runs)
    assert [r[0] for r in runs] == [0, 2, 3]


if __name__ == "__main__":
    test_labels(); test_segmentation(); test_compare(); print("ALL PURE TESTS PASSED")
