require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4000;
const PY_URL = process.env.PY_URL || "http://localhost:8001";
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "../../data/Samyukta");
const ROUNDS = 5;
const ROUND_MS = 5000;
const GRACE_MS = 500; // ignore the first 0.5 s of each round (reaction time)

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const sessions = new Map();
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- dataset helpers ---------- */
function loadMudras() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const out = [];
  for (const d of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(DATA_DIR, d.name);
    const files = fs.readdirSync(dir).sort();
    const first =
      files.find((f) => /\.jpe?g$/i.test(f)) || files.find((f) => /\.(png|webp)$/i.test(f));
    if (first) out.push({ name: d.name, file: path.join(dir, first) });
  }
  return out;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- prediction normalisation (adjust here if your JSON differs) ---------- */
function normalizePrediction(raw) {
  const list = raw.top5 || raw.top_k || raw.topk || raw.predictions || raw.top || [];
  let top = (Array.isArray(list) ? list : []).map((x) => ({
    label: String(x.label ?? x.class ?? x.name ?? x.class_name ?? ""),
    probability: Number(x.probability ?? x.prob ?? x.score ?? x.confidence ?? 0),
  }));
  if (!top.length && raw.label) {
    top = [{ label: String(raw.label), probability: Number(raw.probability ?? raw.confidence ?? 0) }];
  }
  if (top.some((t) => t.probability > 1)) top = top.map((t) => ({ ...t, probability: t.probability / 100 }));
  top.sort((a, b) => b.probability - a.probability);
  const c = raw.crop || {};
  const numKeys = ["num_hands", "hands", "n_hands", "hands_detected", "num_detected", "detected"];
  let hands = null;
  for (const k of numKeys) {
    if (typeof c[k] === "number") { hands = c[k]; break; }
    if (Array.isArray(c[k])) { hands = c[k].length; break; }
  }
  return { top, hands };
}

/* ---------- scoring ---------- */
function scoreRound(target, samples) {
  const valid = samples.filter((s) => s.t >= GRACE_MS && Array.isArray(s.top));
  if (!valid.length) return { score: 0, stars: 0, avgProb: 0, hitRate: 0, peak: 0, frames: 0 };
  const probs = valid.map((s) => {
    if (s.hands === 0) return 0; // no hand visible = no credit
    const m = s.top.find((t) => key(t.label) === key(target));
    return m ? m.probability : 0;
  });
  const hits = valid.filter(
    (s) => s.hands !== 0 && s.top[0] && key(s.top[0].label) === key(target)
  ).length;
  const avgProb = probs.reduce((a, b) => a + b, 0) / probs.length;
  const peak = Math.max(...probs);
  const hitRate = hits / valid.length;
  const score = Math.round(100 * (0.5 * avgProb + 0.3 * hitRate + 0.2 * peak));
  const stars = score >= 80 ? 3 : score >= 55 ? 2 : score >= 30 ? 1 : 0;
  return {
    score, stars, frames: valid.length,
    avgProb: +avgProb.toFixed(3), hitRate: +hitRate.toFixed(3), peak: +peak.toFixed(3),
  };
}

function gradeFor(total) {
  if (total >= 85) return { grade: "S", title: "Mudra Master" };
  if (total >= 70) return { grade: "A", title: "Graceful Performer" };
  if (total >= 50) return { grade: "B", title: "Rising Dancer" };
  if (total >= 30) return { grade: "C", title: "Keep Practising" };
  return { grade: "D", title: "Just Getting Started" };
}

/* ---------- routes ---------- */
app.get("/api/health", async (_req, res) => {
  const mudras = loadMudras();
  let python = false;
  try {
    const r = await fetch(`${PY_URL}/health`);
    python = r.ok && (await r.json()).ready === true;
  } catch {}
  res.json({ ok: mudras.length >= ROUNDS && python, python, mudras: mudras.length, dataDir: DATA_DIR });
});

app.post("/api/game/start", async (_req, res) => {
  let mudras = loadMudras();
  // keep only mudras the trained model knows (if /health exposes class names)
  try {
    const h = await (await fetch(`${PY_URL}/health`)).json();
    const names = h.class_names || h.classes;
    if (Array.isArray(names) && names.length) {
      const set = new Set(names.map(key));
      const f = mudras.filter((m) => set.has(key(m.name)));
      if (f.length >= ROUNDS) mudras = f;
    }
  } catch {}
  if (mudras.length < ROUNDS)
    return res.status(500).json({ error: `Need at least ${ROUNDS} mudra folders in ${DATA_DIR}` });

  const rounds = shuffle(mudras).slice(0, ROUNDS);
  const id = crypto.randomUUID();
  sessions.set(id, { rounds, results: [] });
  res.json({
    id,
    roundMs: ROUND_MS,
    rounds: rounds.map((m, i) => ({
      index: i,
      mudra: m.name,
      imageUrl: `/api/images/${encodeURIComponent(m.name)}`,
    })),
  });
});

app.get("/api/images/:mudra", (req, res) => {
  const m = loadMudras().find((x) => x.name === req.params.mudra); // whitelist lookup
  if (!m) return res.status(404).end();
  res.sendFile(m.file);
});

app.post("/api/predict", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  try {
    const fd = new FormData();
    fd.append("file", new Blob([req.file.buffer], { type: "image/jpeg" }), "frame.jpg");
    const r = await fetch(`${PY_URL}/predict`, { method: "POST", body: fd });
    if (!r.ok) return res.status(r.status).json({ error: `python ${r.status}` });
    res.json(normalizePrediction(await r.json()));
  } catch (e) {
    res.status(502).json({ error: "Python backend unreachable" });
  }
});

app.post("/api/game/:id/round/:i", (req, res) => {
  const s = sessions.get(req.params.id);
  const i = Number(req.params.i);
  if (!s || !s.rounds[i]) return res.status(404).json({ error: "bad session/round" });
  const samples = Array.isArray(req.body.samples) ? req.body.samples : [];
  const result = { index: i, mudra: s.rounds[i].name, ...scoreRound(s.rounds[i].name, samples) };
  s.results[i] = result;

  let summary = null;
  if (s.results.filter(Boolean).length === ROUNDS) {
    const total = Math.round(s.results.reduce((a, r) => a + r.score, 0) / ROUNDS);
    summary = { total, ...gradeFor(total), rounds: s.results };
  }
  res.json({ round: result, summary });
});

app.listen(PORT, () => console.log(`Game API on http://localhost:${PORT}  (data: ${DATA_DIR})`));