"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, SkipForward } from "lucide-react"
import { decodeChallenge, type Challenge } from "@/lib/challenge"
import { deck } from "@/lib/engine/sequence"
import { recordBest } from "@/lib/progress"
import { Button, Meter } from "@/components/play/ui"
import { CameraGate } from "@/components/play/camera-gate"
import { RoundView } from "@/components/play/round-view"
import { ShareChallenge } from "@/components/play/share-challenge"
import { useCamera } from "@/components/play/use-camera"
import type { RoundResult } from "@/components/play/use-round"
import { usePlay } from "@/components/play/use-play"

const TOTAL_MS = 60_000
const SKIP_PENALTY_MS = 3_000
const PER_ITEM_MS = 20_000

type Phase = "ready" | "playing" | "done"

export default function Speed() {
  const { mode, info, mudras, progress, update, ready, router } = usePlay()
  const cam = useCamera()
  const [phase, setPhase] = useState<Phase>("ready")
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const [friend, setFriend] = useState<Challenge | null>(null)
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [penalty, setPenalty] = useState(0)
  const [left, setLeft] = useState(TOTAL_MS)
  const [newBest, setNewBest] = useState(false)
  const startedAt = useRef(0)

  // Opened from a friend's link: play their rounds.
  useEffect(() => {
    const c = decodeChallenge(new URLSearchParams(window.location.search).get("c"))
    if (c && c.game === "speed" && c.mode === mode) {
      setFriend(c)
      setSeed(c.seed)
    }
  }, [mode])

  const next = useMemo(() => deck(mudras, seed), [mudras, seed])

  // The 60-second clock.
  useEffect(() => {
    if (phase !== "playing") return
    startedAt.current = performance.now()
    const t = setInterval(() => {
      const remaining = Math.max(0, TOTAL_MS - (performance.now() - startedAt.current))
      setLeft(remaining)
    }, 100)
    return () => clearInterval(t)
  }, [phase])

  const timeLeft = Math.max(0, left - penalty)

  useEffect(() => {
    if (phase === "playing" && timeLeft <= 0) {
      setNewBest(correct > (progress.best.speed ?? 0))
      update((p) => recordBest(p, "speed", correct).progress)
      setPhase("done")
    }
    // finish once when the clock reaches zero
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase])

  if (!info || !ready || mudras.length === 0) return null

  const begin = () => {
    setIndex(0)
    setCorrect(0)
    setPenalty(0)
    setLeft(TOTAL_MS)
    setNewBest(false)
    setPhase("playing")
  }
  const again = () => {
    setSeed(Math.floor(Math.random() * 2 ** 31))
    setFriend(null)
    begin()
  }
  const onFinish = (r: RoundResult) => {
    if (r.passed) setCorrect((c) => c + 1)
    else setPenalty((p) => p + SKIP_PENALTY_MS) // ran out of time on this one
    setIndex((i) => i + 1)
  }
  const skip = () => {
    setPenalty((p) => p + SKIP_PENALTY_MS)
    setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <button type="button" onClick={() => router.push("/play")} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>
      <p className="eyebrow mb-2">{info.title} · Speed Round</p>
      <h1 className="mb-8 font-serif text-4xl md:text-5xl">60 seconds</h1>

      {friend && phase !== "done" && (
        <p className="mb-6 rounded-2xl border border-accent/40 bg-card/70 px-4 py-3 text-sm">
          {friend.from ?? "A friend"} scored <strong>{friend.score}</strong>. Beat it!
        </p>
      )}

      <CameraGate cam={cam} info={info}>
        {phase === "ready" && (
          <div className="max-w-xl space-y-4">
            <p className="text-lg text-muted-foreground">
              Make as many mudras as you can in 60 seconds. Each one needs to be held for a moment. A skip, or running out of time on one, costs {SKIP_PENALTY_MS / 1000} seconds.
            </p>
            <Button onClick={begin}>Start</Button>
          </div>
        )}

        {phase === "playing" && (
          <div className="space-y-6">
            <div className="flex items-end justify-between gap-6">
              <div className="flex-1">
                <Meter value={timeLeft / TOTAL_MS} label={`${Math.ceil(timeLeft / 1000)} s left`} />
              </div>
              <p className="font-serif text-4xl" aria-live="polite">{correct}</p>
              <Button variant="ghost" onClick={skip}><SkipForward className="h-4 w-4" aria-hidden /> Skip</Button>
            </div>
            <RoundView key={index} cam={cam} info={info} mudra={next(index)} show="photo" heading="Make this mudra" timeMs={PER_ITEM_MS} running onFinish={onFinish} />
          </div>
        )}

        {phase === "done" && (
          <div className="max-w-xl space-y-5">
            <p className="eyebrow">Time&apos;s up</p>
            <p className="font-serif text-7xl">{correct}</p>
            <p className="text-muted-foreground">
              {correct === 1 ? "mudra" : "mudras"} made. {newBest && <strong className="text-accent">A new best!</strong>}
              {friend && (
                <>
                  {" "}
                  {correct > friend.score ? `You beat ${friend.from ?? "your friend"}'s ${friend.score}.` : correct === friend.score ? `You tied ${friend.from ?? "your friend"}'s ${friend.score}.` : `${friend.from ?? "Your friend"} scored ${friend.score}.`}
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={again}>Play again</Button>
              <Button variant="ghost" onClick={() => router.push("/play")}>Back to games</Button>
            </div>
            {mode && correct > 0 && <ShareChallenge challenge={{ mode, game: "speed", seed, score: correct }} />}
          </div>
        )}
      </CameraGate>
    </main>
  )
}
