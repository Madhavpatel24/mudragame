"""Train the Samyukta Hasta classifier (EfficientNet-B0 transfer learning). GPU-optimised: mixed precision, channels_last."""
import os
import time
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .dataset import discover, split_indices, ImageDataset
from .model import build_model, train_transform, eval_transform
from .utils import save_json, now_iso


def _make_scaler(enabled):
    try:
        return torch.amp.GradScaler("cuda", enabled=enabled)        # torch >= 2.3
    except (AttributeError, TypeError):
        return torch.cuda.amp.GradScaler(enabled=enabled)           # older torch


def _evaluate(model, loader, device, criterion=None):
    model.eval()
    use_amp = device == "cuda"
    preds, ys, loss_sum, n = [], [], 0.0, 0
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            if use_amp:
                x = x.contiguous(memory_format=torch.channels_last)
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                out = model(x)
            out = out.float()
            if criterion is not None:
                loss_sum += criterion(out, y).item() * len(y)
            n += len(y)
            preds.append(out.argmax(1).cpu().numpy())
            ys.append(y.cpu().numpy())
    preds, ys = np.concatenate(preds), np.concatenate(ys)
    return float((preds == ys).mean()), loss_sum / max(n, 1), preds, ys


def train(cfg):
    tc, dc = cfg["train"], cfg["dataset"]
    out = f"{cfg['paths']['outputs']}/model"
    os.makedirs(out, exist_ok=True)
    torch.manual_seed(dc["seed"])
    np.random.seed(dc["seed"])

    if torch.cuda.is_available():
        device = "cuda"
        torch.backends.cudnn.benchmark = True
        print(f"[train] device: cuda ({torch.cuda.get_device_name(0)})")
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        device = "mps"
        print("[train] device: mps")
    else:
        device = "cpu"
        print("[train] device: cpu  (slow - consider Kaggle GPU)")
    use_amp = device == "cuda"
    scaler = _make_scaler(use_amp)

    paths, y, class_names = discover(cfg["paths"]["dataset_root"], dc["double_hand_path_hint"], dc["classes_file"])
    print(f"[train] {len(paths)} images, {len(class_names)} classes: {class_names}")
    if len(class_names) != 21:
        print(f"[train] NOTE: expected 21 Samyukta classes, found {len(class_names)} - check the folder / path hint.")
    tr, va, te = split_indices(paths, y, dc["val_fraction"], dc["test_fraction"], dc["seed"], dc["group_regex"])
    print(f"[train] split train/val/test = {len(tr)}/{len(va)}/{len(te)}")

    size, nw = tc["img_size"], tc["num_workers"]

    def make_loader(idx, tf, shuffle):
        kw = dict(batch_size=tc["batch_size"], shuffle=shuffle, num_workers=nw, pin_memory=(device == "cuda"))
        if nw > 0:
            kw.update(persistent_workers=True, prefetch_factor=4)
        return DataLoader(ImageDataset([paths[i] for i in idx], y[idx], tf), **kw)

    dl_tr = make_loader(tr, train_transform(size), True)
    dl_va = make_loader(va, eval_transform(size), False)
    dl_te = make_loader(te, eval_transform(size), False)

    model = build_model(len(class_names), tc["pretrained"], tc["dropout"]).to(device)
    if use_amp:
        model = model.to(memory_format=torch.channels_last)
    criterion = nn.CrossEntropyLoss(label_smoothing=tc["label_smoothing"])
    version = f"samyukta_effnetb0_{time.strftime('%Y%m%d-%H%M')}"
    ckpt_path = f"{out}/model.pt"
    best = {"val_acc": -1.0}
    history = []

    def save_ckpt(metrics):
        torch.save({"state_dict": model.state_dict(), "class_names": class_names, "img_size": size,
                    "arch": "efficientnet_b0", "dropout": tc["dropout"], "model_version": version,
                    "metrics": metrics}, ckpt_path)

    def phase(name, epochs, lr, freeze):
        for p in model.features.parameters():
            p.requires_grad = not freeze
        params = [p for p in model.parameters() if p.requires_grad]
        opt = torch.optim.AdamW(params, lr=lr, weight_decay=tc["weight_decay"])
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(epochs, 1))
        bad = 0
        for ep in range(1, epochs + 1):
            model.train()
            t0, tot, cnt, corr = time.time(), 0.0, 0, 0
            for x, yb in dl_tr:
                x = x.to(device, non_blocking=True)
                yb = yb.to(device, non_blocking=True)
                if use_amp:
                    x = x.contiguous(memory_format=torch.channels_last)
                opt.zero_grad(set_to_none=True)
                with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                    o = model(x)
                loss = criterion(o.float(), yb)
                scaler.scale(loss).backward()
                scaler.step(opt)
                scaler.update()
                tot += loss.item() * len(yb)
                cnt += len(yb)
                corr += (o.argmax(1) == yb).sum().item()
            sched.step()
            va_acc, va_loss, _, _ = _evaluate(model, dl_va, device, criterion)
            history.append({"phase": name, "epoch": ep, "train_loss": tot / cnt, "train_acc": corr / cnt,
                            "val_loss": va_loss, "val_acc": va_acc})
            print(f"[{name}] epoch {ep}/{epochs}  train_acc {corr / cnt:.3f}  val_acc {va_acc:.3f}  ({time.time() - t0:.0f}s)", flush=True)
            if va_acc > best["val_acc"]:
                best["val_acc"] = va_acc
                bad = 0
                save_ckpt({"val_acc": va_acc})
            else:
                bad += 1
                if bad >= tc["patience"] and not freeze:
                    print(f"[{name}] early stop")
                    break

    phase("head", tc["epochs_head"], tc["lr_head"], freeze=True)
    phase("finetune", tc["epochs_finetune"], tc["lr_finetune"], freeze=False)

    ck = torch.load(ckpt_path, map_location=device)
    model.load_state_dict(ck["state_dict"])
    te_acc, _, preds, ys = _evaluate(model, dl_te, device)
    print(f"[train] TEST accuracy: {te_acc:.4f}")

    labels = list(range(len(class_names)))
    rep = classification_report(ys, preds, labels=labels, target_names=class_names, digits=3, zero_division=0)
    with open(f"{out}/classification_report.txt", "w", encoding="utf-8") as f:
        f.write(rep)
    cm = confusion_matrix(ys, preds, labels=labels)
    fig, ax = plt.subplots(figsize=(11, 10))
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks(labels); ax.set_xticklabels(class_names, rotation=90, fontsize=7)
    ax.set_yticks(labels); ax.set_yticklabels(class_names, fontsize=7)
    ax.set_xlabel("predicted"); ax.set_ylabel("true")
    fig.tight_layout(); fig.savefig(f"{out}/confusion_matrix.png", dpi=130); plt.close(fig)

    ck["metrics"] = {"val_acc": float(best["val_acc"]), "test_acc": float(te_acc)}
    torch.save(ck, ckpt_path)
    save_json(class_names, f"{out}/class_names.json")
    save_json({"model_version": version, "created_at": now_iso(), "classes": class_names, "n_images": len(paths),
               "split": {"train": len(tr), "val": len(va), "test": len(te)},
               "best_val_acc": float(best["val_acc"]), "test_acc": float(te_acc), "history": history,
               "dataset_license_note": "Bharatanatyam-Mudra-Dataset is CC-BY-SA-4.0: credit it and share derived data alike."},
              f"{out}/training_report.json")
    print(rep)
    print(f"[train] saved {ckpt_path}")
