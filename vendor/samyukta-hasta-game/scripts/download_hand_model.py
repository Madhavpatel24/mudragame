"""Only needed if your mediapipe has no `mp.solutions` (mediapipe >= 0.10.3x). Downloads the Tasks-API hand model."""
import urllib.request

URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
output = "hand_landmarker.task"
urllib.request.urlretrieve(URL, output)
print(f"saved {output}")
