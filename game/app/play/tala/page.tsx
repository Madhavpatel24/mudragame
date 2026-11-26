"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Volume2, VolumeX } from "lucide-react"
import { deck } from "@/lib/engine/sequence"
import { recordBest } from "@/lib/progress"
import { Button, MudraPhoto, Stars, cn } from "@/components/play/ui"
import { CameraGate } from "@/components/play/camera-gate"
import { RoundView } from "@/components/play/round-view"
import { useCamera } from "@/components/play/use-camera"
import type { RoundResult } from "@/components/play/use-round"
import { usePlay } from "@/components/play/use-play"

const BPM = 50 // a slow beat: recognition needs a moment to settle
const BEATS = 4
const BEAT_MS = 60_000 / BPM
const BAR_MS = BEAT_MS * BEATS
const LENGTH = 6
const POOL = 8 // the easiest mudras, so the rhythm is the challenge, not the shapes

type Phase = "ready" | "running" | "done"

export default function Tala() {
  const { mode, info, mudras, progress, update, ready, router } = usePlay()
  const cam = useCamera()
  const [phase, setPhase] = useState<Phase>("ready")
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const [bar, setBar] = useState(0) // 0 is the count-in, then one bar per mudra
  const [beat, setBeat] = useState(0)
  const [sound, setSound] = useState(true)
  const [results, setResults] = useState<Record<number, RoundResult>>({})
  const [newBest, setNewBest] = useState(false)
  const startAt = useRef(0)
  const audio = useRef<AudioContext | null>(null)
  const soundRef = useRef(sound)
  soundRef.current = sound

  const sequence = useMemo(() => {
    const easy = mudras.slice(0, Math.min(POOL, mudras.length))
    if (easy.length === 0) return [] // before a mode is loaded (also while the page is pre-built)
    const next = deck(easy, seed)
    return Array.from({ length: LENGTH }, (_, i) => next(i))
  }, [mudras, seed])

  const click = (accent: boolean) => {
    const ctx = audio.current
    if (!ctx || !soundRef.current) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = accent ? 880 : 620
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.14)
  }

  // The metronome and the clock that moves from bar to bar.
  useEffect(() => {
    if (phase !== "running") return
    startAt.current = performance.now()
    let lastBeat = -1
    const t = setInterval(() => {
      const elapsed = performance.now() - startAt.current
      const b = Math.floor(elapsed / BEAT_MS)
      if (b !== lastBeat) {
        lastBeat = b
        setBeat(b % BEATS)
        setBar(Math.floor(b / BEATS))
        click(b % BEATS === 0)
      }
    }, 30)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const finished = phase === "running" && bar > LENGTH
  const score = Math.round(sequence.reduce((s, _, i) => s + (results[i]?.score ?? 0), 0) / LENGTH)
  const made = sequence.filter((_, i) => results[i]?.passed).length

  useEffect(() => {
    if (!finished) return
    setNewBest(score > (progress.best.tala ?? 0))
    update((p) => recordBest(p, "tala", score).progress)
    setPhase("done")
    // finish once when the last bar ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  if (!info || !ready || mudras.length === 0) return null

  const begin = () => {
    audio.current ??= new AudioContext()
    void audio.current.resume()
    setResults({})
    setBar(0)
    setBeat(0)
    setNewBest(false)
    setPhase("running")
  }
  const again = () => {
    setSeed(Math.floor(Math.random() * 2 ** 31))
    begin()
  }

  const item = bar >= 1 && bar <= LENGTH ? bar - 1 : -1
  const stars = (made >= LENGTH ? 3 : made >= LENGTH - 2 ? 2 : made >= 2 ? 1 : 0) as 0 | 1 | 2 | 3

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <button type="button" onClick={() => { setPhase("ready"); router.push("/play") }} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>

      <CameraGate
        cam={cam}
        info={info}
        header={
          <>
            <p className="eyebrow mb-2">{info.title} · Tala Beat</p>
            <h1 className="mb-8 font-serif text-4xl md:text-5xl">Change on the beat</h1>
          </>
        }
      >
        {phase === "ready" && (
          <div className="max-w-xl space-y-4">
            <p className="text-lg text-muted-foreground">
              A slow beat plays ({BPM} beats a minute). After one bar of count-in, a new mudra starts on every bar of {BEATS} beats. Make it and hold it before the bar ends. The next mudra is shown ahead of time. {LENGTH} mudras.
            </p>
            <Button onClick={begin}>Start</Button>
          </div>
        )}

        {phase === "running" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3" aria-label={`Beat ${beat + 1} of ${BEATS}`}>
                {Array.from({ length: BEATS }, (_, i) => (
                  <span key={i} className={cn("h-4 w-4 rounded-full border transition", i === beat ? "scale-125 border-accent bg-accent" : "border-border bg-muted")} />
                ))}
              </div>
              <Button variant="ghost" onClick={() => setSound((s) => !s)} aria-pressed={!sound}>
                {sound ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />} {sound ? "Sound on" : "Muted"}
              </Button>
            </div>

            {item === -1 ? (
              <div className="grid min-h-60 place-items-center rounded-3xl border border-border bg-card/70 p-8 text-center" aria-live="polite">
                <div>
                  <p className="eyebrow mb-2">Count-in</p>
                  <p className="font-serif text-7xl">{beat + 1}</p>
                  <p className="mt-4 text-muted-foreground">First mudra: <strong>{sequence[0]!.name}</strong></p>
                </div>
              </div>
            ) : (
              <>
                <RoundView
                  key={item}
                  cam={cam}
                  info={info}
                  mudra={sequence[item]!}
                  show="photo"
                  heading={`Mudra ${item + 1} of ${LENGTH}`}
                  timeMs={BAR_MS - 200}
                  holdScale={0.8}
                  running
                  onFinish={(r) => setResults((prev) => ({ ...prev, [item]: r }))}
                />
                {sequence[item + 1] && (
                  <div className="flex items-center gap-4 rounded-2xl border border-border bg-card/60 p-3">
                    <MudraPhoto mudra={sequence[item + 1]!} className="h-16 w-20" />
                    <p className="text-sm text-muted-foreground">Next: <strong className="text-foreground">{sequence[item + 1]!.name}</strong></p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="max-w-xl space-y-5">
            <p className="eyebrow">Finished</p>
            <p className="font-serif text-6xl">{score}</p>
            <Stars n={stars} className="origin-left scale-125" />
            <p className="text-muted-foreground">
              {made} of {LENGTH} mudras held on the beat. {newBest && <strong className="text-accent">A new best!</strong>}
            </p>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card/60 text-sm">
              {sequence.map((m, i) => (
                <li key={i} className="flex justify-between px-4 py-2.5">
                  <span>{m.name}</span>
                  <span className="text-muted-foreground">{results[i]?.passed ? `held · ${results[i]!.score}` : "missed"}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button onClick={again}>Play again</Button>
              <Button variant="ghost" onClick={() => router.push("/play")}>Back to games</Button>
            </div>
          </div>
        )}
      </CameraGate>
    </main>
  )
}
