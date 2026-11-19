

## How the Samyukta Hasta game scores poses

The game in `game/web/app/page.js` is separate from the offline teacher/student comparison. It samples the user's webcam, asks the trained classifier for frame probabilities, and compares those probabilities with one randomly selected target mudra.

### Round setup

- The game loads mudra folders from `data/Samyukta`.
- It randomly selects five folders and checks that their names exist in the trained model.
- A round lasts five seconds.
- The UI displays the first image in the target mudra folder as the reference pose.
- The browser captures and sends a frame approximately every three seconds.

Mudra names are normalized by removing case differences, spaces, and punctuation before matching. For example, `Katakamukha 1` is compared as `katakamukha1`.

### Frame matching

For each webcam frame:

1. The browser sends the JPEG frame to the Node game API.
2. The Python model server crops the detected hands with MediaPipe.
3. The trained classifier produces a probability for every mudra using softmax.
4. The game receives the five highest predictions.
5. The target mudra is found in that prediction list by normalized name.

The live UI shows `Matching!` only when the highest-probability prediction is the target mudra:

```text
matching = highest predicted mudra == target mudra
```

The match meter shows the target mudra's own probability, even if another mudra is currently predicted as the top result.

Frames from the first 500 ms of a round are ignored as reaction time.

### Per-round score

For every valid frame after the reaction-time grace period:

- `targetProbability` is the model probability for the target mudra.
- `hit` is 1 only when the target mudra is the highest prediction.
- `peak` is the highest target probability observed during the round.
- A frame with zero detected hands receives zero target probability and cannot count as a hit.

The round score is:

```text
roundScore = round(
  100 * (
    0.50 * averageTargetProbability
    + 0.30 * hitRate
    + 0.20 * peakTargetProbability
  )
)
```

Where:

- `averageTargetProbability` is the mean target probability across valid frames.
- `hitRate` is the number of top-prediction hits divided by the number of valid frames.
- `peakTargetProbability` is the maximum target probability across valid frames.

Example:

```text
Average target probability = 0.70
Hit rate = 0.80
Peak target probability = 0.90

Round score = round(100 * (0.50 * 0.70 + 0.30 * 0.80 + 0.20 * 0.90))
            = 78
```

Each round receives stars from the rounded score:

- 3 stars: 80–100
- 2 stars: 55–79
- 1 star: 30–54
- 0 stars: below 30

### Final grade

The overall result is the arithmetic average of the five rounded round scores:

```text
totalScore = round((round1 + round2 + round3 + round4 + round5) / 5)
```

The final grade is:

- **S — Mudra Master:** 85–100
- **A — Graceful Performer:** 70–84
- **B — Rising Dancer:** 50–69
- **C — Keep Practising:** 30–49
- **D — Just Getting Started:** below 30

The scoring implementation is in `game/backend/server.js`. The frame capture loop is in `game/web/app/page.js`, and the frame classifier is in `game/game_model_server.py` and `samyukta/infer.py`.

### Current limitation

The game currently captures approximately every three seconds during a five-second round, so it is effectively a short sequence of pose snapshots rather than continuous frame-by-frame hold tracking. Its score therefore depends heavily on the number and timing of successful predictions returned by the browser.