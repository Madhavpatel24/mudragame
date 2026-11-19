"""End-to-end test of video -> JSON -> comparison using a STUB classifier (colour = class). No torch or dataset needed."""
import sys, pathlib, json, tempfile, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np, cv2

from samyukta.utils import load_config, save_json
from samyukta import pipeline as P
from test_pure import CLASSES

FPS, DUR = 10, 4


class StubClassifier:
    class_names, version = CLASSES, "stub_v0"

    def predict(self, images, batch=32):
        probs, embs = [], []
        for im in images:
            a = np.asarray(im).astype(float)
            k = int(round(a[..., 0].mean() / 10)) - 2          # red channel encodes class index
            p = np.full(len(CLASSES), 0.01)
            if 0 <= k < len(CLASSES):
                p[k] = 0.9
            probs.append(p / p.sum())
            e = np.zeros(32); e[k % 32] = 1.0; e += 0.01
            embs.append(e)
        return np.array(probs), np.array(embs)


def make_video(path, seq, blank_between=0.0):
    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (96, 96))
    for name in seq:
        k = CLASSES.index(name) if name else -2
        frame = np.zeros((96, 96, 3), np.uint8); frame[..., 2] = (k + 2) * 10   # BGR: red channel
        for _ in range(FPS * DUR):
            w.write(frame)
    w.release()


def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    cfg = load_config(); cfg["crop"]["method"] = "full"; cfg["video"]["sample_fps"] = 5
    teacher_seq = ["Anjali", "Kapotham", None, "Karkatta", "Swastikam"]    # None = Dola (not in dataset)
    segs = {"segments": [{"id": i + 1, "name": n, "start": i * DUR, "end": (i + 1) * DUR}
                         for i, n in enumerate(["Angali", "Kapotha", "Dola", "Karkata", "Swastika"])]}
    save_json(segs, tmp / "segs.json")
    make_video(tmp / "t.mp4", teacher_seq)
    clf = StubClassifier()
    t = P.run_teacher(cfg, clf, tmp / "t.mp4", tmp / "segs.json", tmp / "teacher")
    assert [m["label"] for m in t["movements"]] == ["Anjali", "Kapotham", "Karkatta", "Swastikam"]
    assert t["summary"]["agreement_rate"] == 1.0 and t["excluded_segments"][0]["name"] == "Dola"

    # student: skips Kapotham, performs Chakra instead of Karkatta, plus a blank (transition) gap
    make_video(tmp / "s.mp4", ["Anjali", None, "Chakra", "Swastikam"])
    s = P.run_student(cfg, clf, tmp / "s.mp4", tmp / "student")
    assert [m["label"] for m in s["movements"]] == ["Anjali", "Chakra", "Swastikam"], [m["label"] for m in s["movements"]]
    rep = P.run_compare(cfg, tmp / "teacher/teacher_reference.json", tmp / "student/student_performance.json", tmp / "student")
    st = rep["summary"]
    assert (st["correct"], st["wrong_mudra"], st["missing"], st["extra"]) == (2, 1, 1, 0), st
    assert (tmp / "student/comparison_timeline.png").exists()
    json.loads((tmp / "teacher/teacher_reference.json").read_text())
    print("E2E STUB TEST PASSED ->", tmp)


if __name__ == "__main__":
    main()
