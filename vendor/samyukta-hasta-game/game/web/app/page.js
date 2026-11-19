"use client";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const INTERVAL_MS = 3000; // time between webcam frames sent for prediction
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

export default function Page() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const cancelRef = useRef(false);
  const roundStartRef = useRef(0);

  const [phase, setPhase] = useState("idle"); // idle | countdown | playing | result
  const [error, setError] = useState("");
  const [game, setGame] = useState(null);
  const [roundIdx, setRoundIdx] = useState(0);
  const [count, setCount] = useState(3);
  const [timeLeft, setTimeLeft] = useState(5);
  const [live, setLive] = useState(null);
  const [roundResults, setRoundResults] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => () => stopCamera(), []);

  // countdown timer display while playing
  useEffect(() => {
    if (phase !== "playing") return;
    const roundDurationSec = (game?.roundMs ?? 5000) / 1000;
    const id = setInterval(() => {
      const left = Math.max(0, roundDurationSec - (performance.now() - roundStartRef.current) / 1000);
      setTimeLeft(left);
    }, 100);
    return () => clearInterval(id);
  }, [phase, roundIdx, game?.roundMs]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function api(path, opts) {
    const r = await fetch(API + path, opts);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  }

  function captureFrame() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return Promise.resolve(null);
    const c = canvasRef.current;
    c.width = 640;
    c.height = Math.round((640 * v.videoHeight) / v.videoWidth);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, "image/jpeg", 0.8));
  }

  async function predict(blob) {
    const fd = new FormData();
    fd.append("file", blob, "frame.jpg");
    return api("/api/predict", { method: "POST", body: fd });
  }

  async function startGame() {
    setError("");
    cancelRef.current = false;
    setRoundResults([]);
    setSummary(null);
    setLive(null);
    try {
      const h = await api("/api/health");
      if (!h.python) throw new Error("Python model server (port 8000) is not running.");
      if (!h.ok) throw new Error(`Not enough mudra folders found in ${h.dataDir}`);

      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false,
        });
      }
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();

      const g = await api("/api/game/start", { method: "POST" });
      setGame(g);
      setRoundIdx(0);

      setPhase("countdown");
      for (let c = 3; c >= 1; c--) {
        setCount(c);
        await sleep(1000);
        if (cancelRef.current) return;
      }

      setPhase("playing");
      for (let i = 0; i < g.rounds.length; i++) {
        setRoundIdx(i);
        setTimeLeft(g.roundMs / 1000);
        setLive(null);
        const samples = [];
        const start = performance.now();
        roundStartRef.current = start;

        while (performance.now() - start < g.roundMs) {
          if (cancelRef.current) return;
          const t0 = performance.now();
          const blob = await captureFrame();
          if (blob) {
            try {
              const p = await predict(blob);
              samples.push({ t: t0 - start, top: p.top, hands: p.hands });
              setLive(p);
            } catch {
              /* skip a failed frame */
            }
          }
          await sleep(Math.max(0, INTERVAL_MS - (performance.now() - t0)));
        }

        const res = await api(`/api/game/${g.id}/round/${i}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ samples }),
        });
        setRoundResults((r) => [...r, res.round]);
        if (res.summary) setSummary(res.summary);
      }
      stopCamera();
      setPhase("result");
    } catch (e) {
      stopCamera();
      if (e.name === "NotReadableError" || e.name === "TrackStartError") {
        setError("Camera is already in use. Close the other camera page or app, then try again.");
        setPhase("idle");
        return;
      }
      setError(e.message || String(e));
      setPhase("idle");
    }
  }

  function quit() {
    cancelRef.current = true;
    stopCamera();
    setPhase("idle");
  }

  const current = game?.rounds?.[roundIdx];
  const matchProb =
    current && live?.top
      ? live.top.find((t) => key(t.label) === key(current.mudra))?.probability ?? 0
      : 0;
  const matching = live?.top?.[0] && current && key(live.top[0].label) === key(current.mudra);

  return (
    <main className="wrap">
      <header>
        <h1>🙏 Samyukta Hasta Challenge</h1>
        <p>Copy the mudra shown on screen. 5 mudras, 5 seconds each.</p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* video element is always mounted so the camera stays attached */}
      <div className={`stage ${phase === "idle" || phase === "result" ? "hidden" : ""}`}>
        <section className="panel">
          <div className="dots">
            {game?.rounds.map((_, i) => (
              <span key={i} className={i < roundResults.length ? "done" : i === roundIdx ? "now" : ""} />
            ))}
          </div>

          {phase === "countdown" && <div className="big">{count}</div>}

          {phase === "playing" && current && (
            <>
              <div className="roundlabel">
                Round {roundIdx + 1} / {game.rounds.length}
              </div>
              <img className="ref" src={API + current.imageUrl} alt={current.mudra} />
              <h2>{current.mudra}</h2>
              <div className="bar">
                <div key={roundIdx} className="barfill" style={{ animationDuration: `${game.roundMs}ms` }} />
              </div>
              <div className="secs">{Math.ceil(timeLeft)}s</div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="videobox">
            <video ref={videoRef} playsInline muted />
            {phase === "playing" && (
              <div className={`badge ${matching ? "good" : ""}`}>
                {matching ? "✔ Matching!" : "Adjust your hands…"}
              </div>
            )}
          </div>
          {phase === "playing" && (
            <div className="meter">
              <div className="meterfill" style={{ width: `${Math.round(matchProb * 100)}%` }} />
              <span>Match {Math.round(matchProb * 100)}%</span>
            </div>
          )}
          <button className="ghost" onClick={quit}>Quit</button>
        </section>
      </div>

      {phase === "idle" && (
        <section className="card center">
          <p>Allow camera access, keep both hands visible, and match each pose as quickly as you can.</p>
          <button className="primary" onClick={startGame}>▶ Start Game</button>
        </section>
      )}

      {phase === "result" && summary && (
        <section className="card center">
          <div className="grade">{summary.grade}</div>
          <h2>{summary.title}</h2>
          <div className="total">{summary.total}<small>/100</small></div>
          <table>
            <thead>
              <tr><th>#</th><th>Mudra</th><th>Stars</th><th>Hold</th><th>Score</th></tr>
            </thead>
            <tbody>
              {summary.rounds.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.mudra}</td>
                  <td>{"★".repeat(r.stars)}{"☆".repeat(3 - r.stars)}</td>
                  <td>{Math.round(r.hitRate * 100)}%</td>
                  <td>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="primary" onClick={startGame}>↻ Play Again</button>
        </section>
      )}

      <canvas ref={canvasRef} hidden />
    </main>
  );
}