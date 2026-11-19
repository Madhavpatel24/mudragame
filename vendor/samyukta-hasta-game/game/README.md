# Samyukta Hasta Game

The game runs as three separate services:

| Service | Start command (from project root) | URL |
| --- | --- | --- |
| Python model API | `.venv\Scripts\python.exe game\game_model_server.py` | `http://localhost:8001` |
| Game API | `Set-Location game\backend; npm.cmd start` | `http://localhost:4000` |
| Game UI | `Set-Location game\web; npm.cmd run dev` | `http://localhost:3000` |

Start each command in its own PowerShell window. Train the model first if
`outputs\model\model.pt` does not exist. The game model server only receives
frames uploaded by the game API; it does not open a webcam. The browser game
requests webcam access after **Start Game** and releases the stream on quit,
completion, or an error.

`server.py` can run at the same time: it serves the classifier demo and its
model API on port 8000. However, if the classifier demo page is open and using
the webcam, close that page before starting the game. A webcam is a browser or
device resource; running a second model API does not make two active camera
streams shareable.

The game UI's global stylesheet is imported by `web\app\layout.js`. The
standalone classifier frontend is served by `server.py` and loads
`/style.css` from its static mount.
