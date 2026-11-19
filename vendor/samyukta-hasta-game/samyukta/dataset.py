from pathlib import Path
import re
import numpy as np
from PIL import Image
from torch.utils.data import Dataset
from sklearn.model_selection import train_test_split, GroupShuffleSplit

from .labels import clean_class_name

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def discover(root, path_hint="double", classes_file=""):
    """Images live in class-named folders: <root>/**/<ClassName>/<image>. Returns (paths, labels, class_names)."""
    root = Path(root)
    if not root.exists():
        raise FileNotFoundError(f"Dataset folder not found: {root}")
    files = [p for p in root.rglob("*") if p.suffix.lower() in IMG_EXT]
    if path_hint:
        hinted = [p for p in files if path_hint.lower() in str(p.relative_to(root)).lower()]
        if hinted:
            files = hinted
        else:
            print(f"[dataset] no path contains '{path_hint}' - using every image under {root}")
    if classes_file and Path(classes_file).exists():
        keep = {l.strip().lower() for l in open(classes_file, encoding="utf-8") if l.strip()}
        files = [p for p in files if clean_class_name(p.parent.name).lower() in keep]
    if not files:
        raise RuntimeError("No images found. See README step 2 (prepare the dataset).")
    cname = lambda p: clean_class_name(p.parent.name)      # "Anjali(1)" -> "Anjali"
    class_names = sorted({cname(p) for p in files})
    idx = {c: i for i, c in enumerate(class_names)}
    return [str(p) for p in files], np.array([idx[cname(p)] for p in files]), class_names


def split_indices(paths, y, val_frac, test_frac, seed, group_regex=""):
    n = len(paths)
    all_idx = np.arange(n)
    groups = None
    if group_regex:
        rx = re.compile(group_regex)
        g = [rx.search(Path(p).name) for p in paths]
        if all(m is not None for m in g):
            groups = np.array([m.group(1) for m in g])
        else:
            print("[dataset] group_regex did not match every file name -> falling back to random split")
    if groups is not None:
        gss = GroupShuffleSplit(n_splits=1, test_size=test_frac, random_state=seed)
        trv, te = next(gss.split(all_idx, y, groups))
        gss2 = GroupShuffleSplit(n_splits=1, test_size=val_frac / (1 - test_frac), random_state=seed)
        tr, va = next(gss2.split(trv, y[trv], groups[trv]))
        return trv[tr], trv[va], te
    print("[dataset] WARNING: random (not volunteer-disjoint) split - the same volunteer can appear in train and test, "
          "so test accuracy will be optimistic. Set dataset.group_regex to fix.")
    trv, te = train_test_split(all_idx, test_size=test_frac, stratify=y, random_state=seed)
    tr, va = train_test_split(trv, test_size=val_frac / (1 - test_frac), stratify=y[trv], random_state=seed)
    return tr, va, te


class ImageDataset(Dataset):
    def __init__(self, paths, labels, transform):
        self.paths, self.labels, self.transform = paths, labels, transform

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        img = Image.open(self.paths[i]).convert("RGB")
        return self.transform(img), int(self.labels[i])
