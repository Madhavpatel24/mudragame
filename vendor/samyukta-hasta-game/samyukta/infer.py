import numpy as np
import torch
from PIL import Image

from .model import build_model, eval_transform, forward_with_embedding


class MudraClassifier:
    def __init__(self, ckpt_path, device=None):
        ck = torch.load(ckpt_path, map_location="cpu")
        self.class_names = ck["class_names"]
        self.version = ck.get("model_version", "unknown")
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = build_model(len(self.class_names), pretrained=False, dropout=ck.get("dropout", 0.3))
        self.model.load_state_dict(ck["state_dict"])
        self.model.to(self.device).eval()
        self.tf = eval_transform(ck["img_size"])

    @torch.no_grad()
    def predict(self, images, batch_size=32):
        """images: list of RGB uint8 arrays or PIL images -> (probs [N,C], embeddings [N,D])."""
        probs, embs = [], []
        for i in range(0, len(images), batch_size):
            batch = [self.tf(im if isinstance(im, Image.Image) else Image.fromarray(im)) for im in images[i:i + batch_size]]
            logits, emb = forward_with_embedding(self.model, torch.stack(batch).to(self.device))
            probs.append(torch.softmax(logits, 1).cpu().numpy()); embs.append(emb.cpu().numpy())
        return np.concatenate(probs), np.concatenate(embs)
