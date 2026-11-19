import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]
FILL = (124, 116, 104)


class Letterbox:
    """Pad to square (keeps aspect ratio, so two-hand shapes are not squashed) then resize."""
    def __init__(self, size, fill=FILL):
        self.size, self.fill = size, fill

    def __call__(self, img):
        w, h = img.size
        s = max(w, h)
        canvas = Image.new("RGB", (s, s), self.fill)
        canvas.paste(img, ((s - w) // 2, (s - h) // 2))
        return canvas.resize((self.size, self.size), Image.BILINEAR)


def train_transform(size):
    return transforms.Compose([
        Letterbox(int(size * 1.15)),
        transforms.RandomResizedCrop(size, scale=(0.65, 1.0), ratio=(0.9, 1.1)),
        transforms.RandomRotation(12, fill=FILL),
        transforms.ColorJitter(0.4, 0.4, 0.4, 0.05),
        transforms.RandomApply([transforms.GaussianBlur(5, (0.1, 2.0))], p=0.3),   # video frames are softer than studio photos
        transforms.RandomGrayscale(0.05),
        transforms.ToTensor(), transforms.Normalize(MEAN, STD)])
    # NOTE: no horizontal flip on purpose - flipping swaps left/right hand and can change a mudra's identity.


def eval_transform(size):
    return transforms.Compose([Letterbox(size), transforms.ToTensor(), transforms.Normalize(MEAN, STD)])


def build_model(num_classes, pretrained=True, dropout=0.3):
    weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
    m = models.efficientnet_b0(weights=weights)
    m.classifier = nn.Sequential(nn.Dropout(dropout), nn.Linear(m.classifier[1].in_features, num_classes))
    return m


def forward_with_embedding(m, x):
    f = torch.flatten(m.avgpool(m.features(x)), 1)
    return m.classifier(f), f
