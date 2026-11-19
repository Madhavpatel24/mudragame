import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

COLORS = {"correct": "#2e9e5b", "wrong_mudra": "#d64545", "missing": "#9aa0a6", "extra": "#e8962e"}


def plot_timeline(teacher, student, report, path):
    status_by_t = {r["teacher_movement_id"]: r["status"] for r in report["movements"]}
    status_by_s = {r["student_movement_id"]: r["status"] for r in report["movements"] if r["student_movement_id"] is not None}
    fig, ax = plt.subplots(figsize=(16, 3.8))
    for row, (mvs, lookup) in enumerate([(teacher["movements"], status_by_t), (student["movements"], status_by_s)]):
        y = 12 - row * 10
        for m in mvs:
            st = lookup.get(m["movement_id"], "extra")
            ax.broken_barh([(m["start_time"], m["end_time"] - m["start_time"])], (y, 8), facecolors=COLORS[st], edgecolor="white")
            ax.text((m["start_time"] + m["end_time"]) / 2, y + 4, m["label"], rotation=90, ha="center", va="center", fontsize=7, color="white")
    ax.set_yticks([16, 6]); ax.set_yticklabels(["Teacher", "Student"])
    ax.set_xlabel("time (s)")
    ax.set_title(f"Overall score: {report['summary']['overall_score']:.1f}   "
                 f"correct {report['summary']['correct']}/{report['summary']['teacher_movements']}")
    ax.legend(handles=[plt.Rectangle((0, 0), 1, 1, color=c) for c in COLORS.values()], labels=list(COLORS), loc="upper right", ncol=4, fontsize=8)
    fig.tight_layout(); fig.savefig(path, dpi=130); plt.close(fig)
