(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const video = $("video");
  const overlay = $("overlay");
  const ctx = overlay.getContext("2d");
  const statusEl = $("status");
  const top1Label = $("top1-label");
  const top1Conf = $("top1-conf");
  const barsEl = $("bars");
  const cropImg = $("crop");
  const latencyEl = $("stat-latency");
  const fpsEl = $("stat-fps");
  const handsEl = $("stat-hands");
  const cropMethodEl = $("stat-crop");
  const temporalEl = $("temporal");
  const intervalEl = $("interval");
  const intervalValue = $("interval-value");

  const SEND_WIDTH = 640;
  const SMOOTH_N = 5;
  let sendIntervalMs = 200;
  let inFlight = false;
  let lastSendAt = 0;
  const sendTimes = [];
  const history = [];

  intervalEl.addEventListener("input", () => {
    sendIntervalMs = Number(intervalEl.value);
    intervalValue.textContent = sendIntervalMs;
  });

  (async () => {
    if (!(await checkHealth())) return;
    await startWebcam();
    loop();
  })();

  async function checkHealth() {
    try {
      const response = await fetch("/health");
      const data = await response.json();
      if (!data.ready) {
        setStatus("model not loaded — run training first", "err");
        return false;
      }
      setStatus(`ready · ${data.classes.length} classes`, "ok");
      return true;
    } catch {
      setStatus("server not running — start `python server.py`", "err");
      return false;
    }
  }

  async function startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      sizeOverlay();
    } catch (error) {
      setStatus("webcam blocked: " + error.message, "err");
    }
  }
  video.addEventListener("loadedmetadata", sizeOverlay);

  function sizeOverlay() {
    if (video.videoWidth && video.videoHeight) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }
  }

  function loop() {
    requestAnimationFrame(() => {
      const now = performance.now();
      if (!inFlight && now - lastSendAt >= sendIntervalMs && video.readyState >= 2) {
        lastSendAt = now;
        sendFrame();
      }
      loop();
    });
  }

  async function sendFrame() {
    inFlight = true;
    const started = performance.now();
    try {
      const blob = await captureBlob();
      if (!blob) return;
      const form = new FormData();
      form.append("file", blob, "frame.jpg");
      const response = await fetch("/predict", { method: "POST", body: form });
      if (!response.ok) {
        setStatus("server error " + response.status, "err");
        return;
      }
      handleResult(await response.json());
      const roundTrip = performance.now() - started;
      latencyEl.textContent = roundTrip.toFixed(0) + " ms";
      sendTimes.push(started);
      if (sendTimes.length > 10) sendTimes.shift();
      if (sendTimes.length > 1) {
        const span = sendTimes.at(-1) - sendTimes[0];
        fpsEl.textContent = ((sendTimes.length - 1) / (span / 1000)).toFixed(1);
      }
    } catch (error) {
      console.error(error);
      setStatus("connection error", "err");
    } finally {
      inFlight = false;
    }
  }

  function captureBlob() {
    if (!video.videoWidth) return Promise.resolve(null);
    const scale = SEND_WIDTH / video.videoWidth;
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  }

  function handleResult(data) {
    const probabilities = {};
    data.top.forEach((item) => (probabilities[item.label] = item.prob));

    if (temporalEl.checked) {
      history.push(probabilities);
      while (history.length > SMOOTH_N) history.shift();
    } else {
      history.length = 0;
      history.push(probabilities);
    }

    const labels = new Set();
    history.forEach((item) => Object.keys(item).forEach((label) => labels.add(label)));
    const smoothed = [...labels]
      .map((label) => ({
        label,
        prob: history.reduce((sum, item) => sum + (item[label] || 0), 0) / history.length,
      }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 5);

    const best = smoothed[0];
    top1Label.textContent = best ? best.label : "—";
    top1Conf.textContent = best
      ? (best.prob * 100).toFixed(1) + "% confidence"
      : "no prediction";

    barsEl.replaceChildren();
    smoothed.forEach((row) => {
      const element = document.createElement("div");
      element.className = "bar";
      element.innerHTML = `
        <div class="bar-label" title="${row.label}">${row.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(row.prob * 100).toFixed(1)}%"></div></div>
        <div class="bar-prob">${(row.prob * 100).toFixed(0)}%</div>`;
      barsEl.appendChild(element);
    });

    if (data.crop_preview) cropImg.src = data.crop_preview;
    handsEl.textContent = data.crop.hands_detected ?? "—";
    cropMethodEl.textContent = data.crop.method;
    drawBbox(data);
  }

  function drawBbox(data) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!data.crop?.bbox) return;
    const [x0, y0, x1, y1] = data.crop.bbox;
    const scaleX = overlay.width / data.image.width;
    const scaleY = overlay.height / data.image.height;
    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = Math.max(2, overlay.width / 400);
    ctx.strokeRect(x0 * scaleX, y0 * scaleY, (x1 - x0) * scaleX, (y1 - y0) * scaleY);
  }

  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }
})();
