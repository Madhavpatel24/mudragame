"""Prepares the Asamyukta mudra illustrations for the game.

Each drawing is centred on a plain white background at the same size, so hands drawn small in one
file and large in another look consistent.

Run:  python tools/prepare_illustrations.py <folder with the 21 drawings>
Writes game/public/mudras/asamyukta/<id>.jpg
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "game" / "public" / "mudras" / "asamyukta"
SIZE = (960, 720)
MARGIN = 0.07  # share of the frame left empty around the hand

# file name in the source folder -> mudra id
FILES = {
    "alapadma_landscape.png": "alapadma", "Arala Mudra with Gold Bangles.png": "arala",
    "ardhachandra_landscape.png": "ardhachandra", "ardhapatakha.png": "ardhapathaka",
    "chandrakala.png": "chandrakala", "hamsasya.png": "hamsasya", "kapitha.png": "kapittha",
    "kartarimukha.png": "kartarimukha", "mayura_landscape.png": "mayura", "mukula.png": "mukula",
    "mushti.png": "mushti", "patakha(1)_landscape.png": "pathaka", "samdamsha.png": "samdamsha",
    "sarpashirsha.png": "sarpashirsha", "shikhara.png": "shikhara", "shukatunda.png": "shukatunda",
    "simhamukha.png": "simhamukha", "suchi.png": "suchi", "tamrachuda.png": "tamrachuda",
    "tripatakha_landscape.png": "tripathaka", "trishula_landscape.png": "trishula",
}


def prepare(path: Path) -> Image.Image:
    a = np.array(Image.open(path).convert("RGB")).astype("int16")
    # the almost-white, colourless background becomes pure white
    background = (a.min(axis=2) >= 232) & ((a.max(axis=2) - a.min(axis=2)) < 12)
    a[background] = 255
    ink = np.argwhere(~background)
    (top, left), (bottom, right) = ink.min(axis=0), ink.max(axis=0) + 1
    hand = Image.fromarray(a.astype("uint8")).crop((left, top, right, bottom))

    room = (SIZE[0] * (1 - 2 * MARGIN), SIZE[1] * (1 - 2 * MARGIN))
    scale = min(room[0] / hand.width, room[1] / hand.height)
    hand = hand.resize((round(hand.width * scale), round(hand.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGB", SIZE, "white")
    canvas.paste(hand, ((SIZE[0] - hand.width) // 2, (SIZE[1] - hand.height) // 2))
    return canvas


if __name__ == "__main__":
    source = Path(sys.argv[1])
    missing = [f for f in FILES if not (source / f).is_file()]
    if missing:
        sys.exit(f"Missing from {source}: {', '.join(missing)}")
    OUT.mkdir(parents=True, exist_ok=True)
    for name, mudra in FILES.items():
        prepare(source / name).save(OUT / f"{mudra}.jpg", quality=90, optimize=True)
    print(f"Wrote {len(FILES)} illustrations to {OUT}")
