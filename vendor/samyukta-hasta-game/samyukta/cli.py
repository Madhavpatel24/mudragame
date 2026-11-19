import argparse
import os
import sys

from .utils import load_config


def _roi(s):
    if not s:
        return None
    v = [float(x) for x in s.split(",")]
    if len(v) != 4:
        raise argparse.ArgumentTypeError("--roi must be x,y,w,h (normalised 0-1)")
    return v


def main(argv=None):
    ap = argparse.ArgumentParser(prog="run.py", description="Samyukta Hasta PoC")
    ap.add_argument("--config", default="config.yaml")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("prepare-hf", help="export the double-hand images from the HuggingFace dataset into class folders")
    p.add_argument("--repo", default="Midhull/bharatanatyam-mudra-dataset"); p.add_argument("--out", default=None)

    p = sub.add_parser("preview", help="check hand detection / ROI on sample frames (no model needed)")
    p.add_argument("--video"); p.add_argument("--roi", type=_roi); p.add_argument("--n", type=int, default=12)
    p.add_argument("--start", type=float); p.add_argument("--end", type=float); p.add_argument("--out", default=None)

    p = sub.add_parser("visualize", help="HTML report, timeline, contact sheet and annotated video from a saved teacher/student JSON")
    p.add_argument("--json", default=None, help="default: outputs/teacher/teacher_reference.json")
    p.add_argument("--video"); p.add_argument("--roi", type=_roi); p.add_argument("--no-video", action="store_true")

    sub.add_parser("check-data", help="list classes/counts and show how teacher segments map to them")
    sub.add_parser("train", help="train the EfficientNet-B0 classifier")

    p = sub.add_parser("teacher", help="recognise the teacher video and save teacher_reference.json")
    p.add_argument("--video"); p.add_argument("--segments"); p.add_argument("--roi", type=_roi)
    p.add_argument("--label-source", choices=["segment", "classifier"])

    p = sub.add_parser("student", help="recognise a student video and save student_performance.json")
    p.add_argument("--video", required=True); p.add_argument("--name", default=None); p.add_argument("--roi", type=_roi)
    p.add_argument("--start", type=float); p.add_argument("--end", type=float)

    p = sub.add_parser("compare", help="compare saved student JSON against the teacher JSON")
    p.add_argument("--student", required=True); p.add_argument("--teacher", default=None)

    p = sub.add_parser("evaluate", help="student recognition + comparison in one go")
    p.add_argument("--video", required=True); p.add_argument("--name", default=None); p.add_argument("--roi", type=_roi)
    p.add_argument("--teacher", default=None); p.add_argument("--start", type=float); p.add_argument("--end", type=float)

    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    out = cfg["paths"]["outputs"]
    model_path = os.path.join(out, "model", "model.pt")
    teacher_json = lambda: getattr(a, "teacher", None) or os.path.join(out, "teacher", "teacher_reference.json")

    if a.cmd == "prepare-hf":
        from scripts.prepare_hf_dataset import export
        export(a.repo, a.out or cfg["paths"]["dataset_root"])
    elif a.cmd == "check-data":
        from .dataset import discover
        from .labels import map_segments
        from .utils import load_json
        import collections
        paths, y, classes = discover(cfg["paths"]["dataset_root"], cfg["dataset"]["double_hand_path_hint"], cfg["dataset"]["classes_file"])
        cnt = collections.Counter(y.tolist())
        print(f"{len(paths)} images, {len(classes)} classes")
        for i, c in enumerate(classes):
            print(f"  {c:<22}{cnt[i]:>6}")
        segs = load_json(cfg["paths"]["teacher_segments"])["segments"]
        mapped, excl = map_segments(segs, classes, cfg["teacher"]["aliases"], cfg["teacher"]["match_cutoff"])
        print("\nTeacher segment -> dataset class")
        for m in mapped:
            print(f"  {m['name']:<18}-> {m['expected_class']:<18} (match {m['match_score']})")
        for e in excl:
            print(f"  {e['name']:<18}-> EXCLUDED ({e['reason']})")
        print("\nWrong match? add it under teacher.aliases in config.yaml.")
    elif a.cmd == "preview":
        from .visualize import preview_crops
        preview_crops(cfg, a.video or cfg["paths"]["teacher_video"], a.out or os.path.join(out, "preview", "crop_preview.png"),
                      a.roi, a.n, a.start, a.end)
    elif a.cmd == "visualize":
        from .visualize import build_all
        build_all(a.json or os.path.join(out, "teacher", "teacher_reference.json"), not a.no_video, a.video, a.roi, cfg)
    elif a.cmd == "train":
        from .train import train
        train(cfg)
    else:
        from .infer import MudraClassifier
        from . import pipeline as P
        if not os.path.exists(model_path):
            sys.exit(f"Model not found: {model_path}. Run `python run.py train` first.")
        clf = MudraClassifier(model_path)
        if a.cmd == "teacher":
            P.run_teacher(cfg, clf, a.video or cfg["paths"]["teacher_video"], a.segments or cfg["paths"]["teacher_segments"],
                          os.path.join(out, "teacher"), a.roi, a.label_source)
        elif a.cmd in ("student", "evaluate"):
            name = a.name or os.path.splitext(os.path.basename(a.video))[0]
            sdir = os.path.join(out, "students", name)
            P.run_student(cfg, clf, a.video, sdir, a.roi, a.start, a.end)
            if a.cmd == "evaluate":
                P.run_compare(cfg, teacher_json(), os.path.join(sdir, "student_performance.json"), sdir)
        elif a.cmd == "compare":
            P.run_compare(cfg, teacher_json(), a.student, os.path.dirname(a.student))
