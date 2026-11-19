import cv2


def video_info(path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return {"fps": fps, "frame_count": n, "duration": n / fps if fps else 0.0, "width": w, "height": h}


def iter_frames(path, sample_fps, start=None, end=None):
    """Yield (frame_index, timestamp_sec, RGB ndarray) at ~sample_fps. Uses grab() to skip cheaply."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(fps / sample_fps)))
    idx = 0
    try:
        while cap.grab():
            t = idx / fps
            if end is not None and t > end:
                break
            if idx % step == 0 and (start is None or t >= start):
                ok, frame = cap.retrieve()
                if ok:
                    yield idx, t, cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            idx += 1
    finally:
        cap.release()


def effective_dt(path, sample_fps):
    fps = video_info(path)["fps"]
    return max(1, int(round(fps / sample_fps))) / fps
