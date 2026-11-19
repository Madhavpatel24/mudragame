"""Export the double-hand (Samyukta) images of the HuggingFace copy into  <out>/<ClassName>/<n>.jpg

Columns in that dataset: image, label, label_id, gesture_type ("single_hand" | "double_hand").
Needs:  pip install datasets
"""
import os
import re


def export(repo, out):
    from datasets import load_dataset
    ds = load_dataset(repo)
    n = 0
    for split in ds:
        d = ds[split]
        for i, row in enumerate(d):
            if "double" not in str(row.get("gesture_type", "double")).lower():
                continue
            cls = re.sub(r"[^\w\-]+", "_", str(row["label"]).strip())
            folder = os.path.join(out, cls); os.makedirs(folder, exist_ok=True)
            row["image"].convert("RGB").save(os.path.join(folder, f"{split}_{i:06d}.jpg"), quality=95)
            n += 1
    print(f"exported {n} double-hand images to {out}")
    print("Next: python run.py check-data   (should show 21 classes)")


if __name__ == "__main__":
    import sys
    export(sys.argv[1] if len(sys.argv) > 1 else "Midhull/bharatanatyam-mudra-dataset", sys.argv[2] if len(sys.argv) > 2 else "data/samyukta")
