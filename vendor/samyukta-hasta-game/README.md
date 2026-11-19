# Samyukta Hasta Game

A webcam game for practising Samyukta Hasta mudras. The game is the main
application in this repository: it shows a mudra, gives the player five seconds
to copy it, and scores the round using the trained image classifier.

## Run the game

The game uses three local services:

| Service | Port | Purpose |
| --- | ---: | --- |
| Game UI (`game/web`) | 3000 | Browser game and webcam capture |
| Game API (`game/backend`) | 4000 | Rounds, reference images, and scoring |
| Model API (`game/game_model_server.py`) | 8001 | Hand crops and mudra predictions |

### Requirements

- Python 3.10 or later
- Node.js 18 or later
- A webcam and a browser that allows camera access

### Install dependencies

Run these commands from the repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Set-Location game\backend
npm.cmd ci
Set-Location ..\web
npm.cmd ci
Set-Location ..\..
```

### Prepare the dataset and train the model

The game needs at least five class folders under `data/Samyukta`. For the full
classifier, prepare the 21 Samyukta (two-hand) mudra classes.

One option is to export the double-hand images from the configured Hugging Face
dataset:

```powershell
python run.py prepare-hf --out data/Samyukta
python run.py check-data
```

Alternatively, place your licensed images in class-named folders, for example
`data/Samyukta/Anjali/*.jpg`. The dataset used by this project is licensed
CC BY-SA 4.0; follow its attribution and share-alike terms when redistributing
the dataset or derived material.

Download the MediaPipe hand detector for hand-focused crops, then train the
classifier:

```powershell
python scripts/download_hand_model.py
python run.py train
```

Training writes `outputs/model/model.pt`. The download command places
`hand_landmarker.task` in the repository root. Without that detector, the model
API falls back to full-frame crops. The model weights and detector are
generated/downloaded assets and do not need to be committed; recreate them
with the commands above.

### Start the services

Open three PowerShell windows at the repository root and run one command in
each:

```powershell
.\.venv\Scripts\python.exe game\game_model_server.py
```

```powershell
Set-Location game\backend
npm.cmd start
```

```powershell
Set-Location game\web
npm.cmd run dev
```

Open **http://localhost:3000** and select **Start Game**. Allow webcam access.
The model API should respond with `"ready": true` at
`http://localhost:8001/health`; the game API health endpoint is
`http://localhost:4000/api/health`.

## Training and evaluation pipeline

The game uses the same EfficientNet-B0 classifier that can be trained and
evaluated through the Python CLI:

1. `python run.py check-data` checks the dataset folders and class labels.
2. `python run.py train` trains the classifier and writes its model and reports
   under `outputs/model/`.
3. `python run.py preview --video <path> --n 30` previews MediaPipe hand
   crops. Add `--roi x,y,w,h` to inspect a particular region of interest.
4. `python run.py evaluate --video <path> --name <name>` runs the optional
   offline student-video recognition and comparison pipeline.

The training settings and dataset location are in `config.yaml`. For reliable
evaluation, use a volunteer-disjoint split when filenames identify volunteers;
otherwise, test accuracy may be optimistic. Check the per-class report and
confusion matrix in `outputs/model/` before relying on predictions.

Run the focused Python pipeline tests with:

```powershell
python tests/test_pure.py
python tests/test_e2e_stub.py
```

## Optional: offline teacher/student analysis

The original video-analysis workflow is still available alongside the game.
It recognizes labeled teacher segments, finds movements in a student video,
and compares their mudra sequence and timing. It is not required to launch or
play the game.

Recognize the teacher video first. Supply a local video path; use `--roi` to
focus detection on the dancer's hands when needed:

```powershell
python run.py teacher --video <teacher-video> --segments reference/teacher_segments.json --roi 0.5,0.15,0.5,0.7
```

Then analyze a student video against that teacher result:

```powershell
python run.py evaluate --video <student-video> --name student1
```

The workflow writes teacher and student JSON, per-frame crops, comparison
feedback, and a timeline under `outputs/`. Comparison includes label and timing
alignment. Its hand-shape score uses classifier embeddings as a proxy; it is
not finger-joint geometry.

## Optional: standalone classifier demo

`server.py` and `frontend/` provide a separate webcam classifier demo. This is
not the game UI; use it to inspect live predictions, hand crops, and latency.
The model must be trained first. Start it from the repository root:

```powershell
.\.venv\Scripts\python.exe server.py
```

Open **http://localhost:8000** and allow webcam access. Check readiness with:

```powershell
curl.exe http://localhost:8000/health
```

## Notes and limitations

- The dataset consists of studio images, while webcam and video inputs vary in
  lighting, backgrounds, and framing. Inspect crops and evaluate on recordings
  representative of actual players.
- Use a volunteer-disjoint train/test split when possible; a random split can
  overstate generalization.
- The game uses MediaPipe hand crops when `hand_landmarker.task` is available;
  without it, the model API falls back to full-frame crops.
- Dola and Utsanga are not included among the 21 trained classes.

## Repository map

- `game/web/` — main game interface
- `game/backend/` — game rounds, reference images, and scoring API
- `game/game_model_server.py` — prediction API used by the game
- `samyukta/` — dataset, training, hand-cropping, inference, and offline
  evaluation pipeline
- `scripts/` — dataset export and MediaPipe model download helpers
- `tests/` — focused pipeline tests
- `frontend/` and `server.py` — optional standalone classifier demo, separate
  from the game UI; not required to run the game
