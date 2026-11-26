# mudra-game

Gamified mudra learning with two modes, chosen on the first screen:

- **Asamyukta** (single-hand): the NrityaNetra on-device model, runs in the browser.
- **Samyukta** (two-hand): Aparna's model server, called over HTTP.

| Folder | What it is |
| --- | --- |
| `asamyukta/` | NrityaNetra code, imported with its history. Unchanged. |
| `vendor/samyukta-hasta-game/` | Aparna's repo, imported with its history. Unchanged. |
| `switcher/` | Mode registry, the manager that switches between models, and one adapter per model. |
| `game/` | The Next.js app: mode screen, learn mode and the games. |
| `tools/` | `build_content_assets.py` makes the photos and the "looks like" tables. |
| `deploy/`, `render.yaml` | Docker and hosting files for Aparna's server. |

The two imported folders are not edited, so each can be updated from its own upstream.

## The games

Everything is different per mode: its own mudras, photos, meanings, ladder and saved progress.

| Game | What it is |
| --- | --- |
| Learn | The photo on one side, the camera on the other. Shows how close you are, scores each held try, and tracks how well each mudra is learned. A button goes to the games whenever the learner feels ready. |
| Mudra Ladder | Seven levels. New mudras arrive three at a time, easiest first, with look-alikes kept apart. The test shows the photo, then only the name, then only the meaning, with less time and longer holds as you climb. |
| Meaning Charades | Given a meaning ("the goddess Lakshmi"), make the mudra. |
| Memory Match | Match photos to names or meanings. No camera. |
| Tala Beat | Change mudras on a slow beat. |
| Mudra Chain | Repeat a growing sequence from memory. |
| Speed Round | As many mudras as possible in 60 seconds. |
| Challenge a Friend | A link with the seed and your score. The friend plays the same rounds. No accounts. |

### How a try is scored

The formula follows Aparna's `demo.md`: 50% average strength of the target, 30% how often it was the top guess,
20% the best moment. One addition: when the top guess is a mudra the target is often mixed up with, the learner
gets partial credit. For mudras the model is weaker on, the second guess is also accepted. See `game/lib/engine/`.

## Running it

```bash
cd game
npm install
npm run dev        # http://localhost:3200
npm test           # engine and content tests
```

For Samyukta, start Aparna's server in another terminal (it listens on port 8001):

```bash
cd vendor/samyukta-hasta-game
python game/game_model_server.py
```

Set `NEXT_PUBLIC_SAMYUKTA_URL` to point the app at a hosted server instead.

## Content

- **Photos:** Samyukta from the Bharatanatyam Mudra Dataset (CC BY-SA 4.0); Asamyukta drawings made by the team. See `NOTICE.md`.
- **Samyukta meanings** come from Aparna's teacher reference.
- **Asamyukta meanings** are a draft from standard descriptions. A dance teacher should check them.
- To rebuild the photos and look-alike tables: `python tools/build_content_assets.py <dataset folder>`.
