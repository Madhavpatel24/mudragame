"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { decodeChallenge, type Challenge } from "@/lib/challenge"
import { deck } from "@/lib/engine/sequence"
import { recordBest } from "@/lib/progress"
import { Button, MudraPhoto, cn } from "@/components/play/ui"
import { CameraGate } from "@/components/play/camera-gate"
import { RoundView } from "@/components/play/round-view"
import { ShareChallenge } from "@/components/play/share-challenge"
import { useCamera } from "@/components/play/use-camera"
import type { RoundResult } from "@/components/play/use-round"
import { usePlay } from "@/components/play/use-play"

const MAX_LENGTH = 8
const STEP_SECONDS = 12
const SHOW_MS = 1600

type Phase = "ready" | "show" | "recall" | "over" | "won"

export default function Chain() {
  const { mode, info, mudras, progress, update, ready, router } = usePlay()
  const cam = useCamera()
  const [phase, setPhase] = useState<Phase>("ready")
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const [friend, setFriend] = useState<Challenge | null>(null)
  const [length, setLength] = useState(1)
  const [step, setStep] = useState(0)
  const [shown, setShown] = useState(0)
  const [newBest, setNewBest] = useState(false)

  useEffect(() => {
    const c = decodeChallenge(new URLSearchParams(window.location.search).get("c"))
    if (c && c.game === "chain" && c.mode === mode) {
      setFriend(c)
      setSeed(c.seed)
    }
  }, [mode])

  const next = useMemo(() => deck(mudras, seed), [mudras, seed])
  const max = Math.min(MAX_LENGTH, mudras.length)
  const completed = phase === "won" ? max : length - 1

  // Show the sequence one mudra at a time, then ask for it back.
  useEffect(() => {
    if (phase !== "show") return
    setShown(0)
    const timers = Array.from({ length }, (_, i) => setTimeout(() => setShown(i + 1), (i + 1) * SHOW_MS))
    const end = setTimeout(() => {
      setStep(0)
      setPhase("recall")
    }, length * SHOW_MS + 400)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(end)
    }
  }, [phase, length])

  if (!info || !ready || mudras.length === 0) return null

  const finishGame = (score: number, won: boolean) => {
    setNewBest(score > (progress.best.chain ?? 0))
    update((p) => recordBest(p, "chain", score).progress)
    setPhase(won ? "won" : "over")
  }

  const onFinish = (r: RoundResult) => {
    if (!r.passed) return finishGame(length - 1, false)
    if (step + 1 < length) return setStep(step + 1)
    if (length >= max) return finishGame(max, true)
    setLength(length + 1)
    setPhase("show")
  }

  const begin = () => {
    setLength(1)
    setStep(0)
    setNewBest(false)
    setPhase("show")
  }
  const again = () => {
    setSeed(Math.floor(Math.random() * 2 ** 31))
    setFriend(null)
    begin()
  }

  const score = completed
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <button type="button" onClick={() => router.push("/play")} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>

      {friend && phase !== "over" && phase !== "won" && (
        <p className="mb-6 rounded-2xl border border-accent/40 bg-card/70 px-4 py-3 text-sm">
          {friend.from ?? "A friend"} reached a chain of <strong>{friend.score}</strong>. Beat it!
        </p>
      )}

      <CameraGate
        cam={cam}
        info={info}
        header={
          <>
            <p className="eyebrow mb-2">{info.title} · Mudra Chain</p>
            <h1 className="mb-8 font-serif text-4xl md:text-5xl">Remember the chain</h1>
          </>
        }
      >
        {phase === "ready" && (
          <div className="max-w-xl space-y-4">
            <p className="text-lg text-muted-foreground">
              You will see a short chain of mudras, one at a time. Then make them again in the same order, from memory. Each time you get it right, the chain grows by one. One mistake ends the game.
            </p>
            <Button onClick={begin}>Start</Button>
          </div>
        )}

        {phase === "show" && (
          <div className="space-y-4" aria-live="polite">
            <p className="eyebrow">Remember this chain of {length}</p>
            <ol className="grid gap-4 sm:grid-cols-4">
              {Array.from({ length }, (_, i) => {
                const m = next(i)
                const visible = i < shown || i === shown
                return (
                  <li key={i} className={cn("space-y-2 transition-opacity", visible ? "opacity-100" : "opacity-20")}>
                    <MudraPhoto mudra={m} className="aspect-[4/3]" />
                    <p className="font-serif text-lg">{i + 1}. {m.name}</p>
                  </li>
                )
              })}
            </ol>
            <Button variant="ghost" onClick={() => { setStep(0); setPhase("recall") }}>I&apos;m ready</Button>
          </div>
        )}

        {phase === "recall" && (
          <RoundView
            key={`${length}-${step}`}
            cam={cam}
            info={info}
            mudra={next(step)}
            show="none"
            heading={`Chain of ${length} · step ${step + 1}`}
            timeMs={STEP_SECONDS * 1000}
            running
            onFinish={onFinish}
          />
        )}

        {(phase === "over" || phase === "won") && (
          <div className="max-w-xl space-y-5">
            <p className="eyebrow">{phase === "won" ? "Perfect" : "The chain broke"}</p>
            <p className="font-serif text-7xl">{score}</p>
            <p className="text-muted-foreground">
              {phase === "won" ? `You remembered the full chain of ${max}.` : `You remembered a chain of ${score}. The next one was ${next(step).name}.`}{" "}
              {newBest && <strong className="text-accent">A new best!</strong>}
              {friend && (score > friend.score ? ` You beat ${friend.from ?? "your friend"}'s ${friend.score}.` : score === friend.score ? ` You tied ${friend.from ?? "your friend"}'s ${friend.score}.` : ` ${friend.from ?? "Your friend"} reached ${friend.score}.`)}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={again}>Play again</Button>
              <Button variant="ghost" onClick={() => router.push("/play")}>Back to games</Button>
            </div>
            {mode && score > 0 && <ShareChallenge challenge={{ mode, game: "chain", seed, score }} />}
          </div>
        )}
      </CameraGate>
    </main>
  )
}
