"use client"

import { useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react"
import { charadesPrompts } from "@/lib/content"
import { seeded, shuffle } from "@/lib/engine/rng"
import { recordBest } from "@/lib/progress"
import { Button, MudraPhoto, Stars } from "@/components/play/ui"
import { CameraGate } from "@/components/play/camera-gate"
import { RoundView } from "@/components/play/round-view"
import { useCamera } from "@/components/play/use-camera"
import type { RoundResult } from "@/components/play/use-round"
import { usePlay } from "@/components/play/use-play"

const ROUNDS = 8
const SECONDS = 15

type Phase = "ready" | "playing" | "reveal" | "done"

export default function Charades() {
  const { mode, info, mudras, progress, update, ready, router } = usePlay()
  const cam = useCamera()
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const [phase, setPhase] = useState<Phase>("ready")
  const [i, setI] = useState(0)
  const [results, setResults] = useState<RoundResult[]>([])
  const [newBest, setNewBest] = useState(false)

  // One prompt per mudra, so two prompts never point to the same answer.
  const rounds = useMemo(() => {
    if (!mode) return []
    const rand = seeded(seed)
    const byMudra = new Map<string, string[]>()
    for (const p of charadesPrompts(mode)) byMudra.set(p.id, [...(byMudra.get(p.id) ?? []), p.prompt])
    const picked = shuffle([...byMudra.keys()], rand).slice(0, ROUNDS)
    return picked.map((id) => {
      const prompts = byMudra.get(id)!
      return { mudra: mudras.find((m) => m.id === id)!, prompt: prompts[Math.floor(rand() * prompts.length)]! }
    })
  }, [mode, mudras, seed])

  if (!info || !ready || rounds.length === 0) return null
  const round = rounds[i]!
  const total = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / rounds.length) : 0

  const finishRound = (r: RoundResult) => {
    setResults((prev) => [...prev, r])
    setPhase("reveal")
  }
  const next = () => {
    if (i + 1 < rounds.length) {
      setI(i + 1)
      setPhase("playing")
      return
    }
    const score = Math.round([...results].reduce((s, r) => s + r.score, 0) / rounds.length)
    setNewBest(score > (progress.best.charades ?? 0))
    update((p) => recordBest(p, "charades", score).progress)
    setPhase("done")
  }
  const again = () => {
    setSeed(Math.floor(Math.random() * 2 ** 31))
    setI(0)
    setResults([])
    setNewBest(false)
    setPhase("playing")
  }
  const last = results[results.length - 1]

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <button type="button" onClick={() => router.push("/play")} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>

      <CameraGate
        cam={cam}
        info={info}
        header={
          <>
            <p className="eyebrow mb-2">{info.title} · Meaning Charades</p>
            <h1 className="mb-8 font-serif text-4xl md:text-5xl">Show me…</h1>
          </>
        }
      >
        {phase === "ready" && (
          <div className="max-w-xl space-y-4">
            <p className="text-lg text-muted-foreground">
              You will be given a meaning, such as a peacock or a wheel. Make the mudra for it within {SECONDS} seconds. {ROUNDS} rounds.
            </p>
            <Button onClick={() => setPhase("playing")}>Start</Button>
          </div>
        )}

        {phase === "playing" && (
          <RoundView
            key={i}
            cam={cam}
            info={info}
            mudra={round.mudra}
            show="none"
            prompt={`Show me: ${round.prompt}`}
            heading={`Round ${i + 1} of ${rounds.length}`}
            timeMs={SECONDS * 1000}
            running
            onFinish={finishRound}
          />
        )}

        {phase === "reveal" && last && (
          <div className="grid items-start gap-8 md:grid-cols-2">
            <MudraPhoto mudra={round.mudra} className="aspect-[4/3]" />
            <div className="space-y-4">
              <p className="inline-flex items-center gap-2 text-lg">
                {last.passed ? <Check className="h-5 w-5 text-emerald-700" aria-hidden /> : <X className="h-5 w-5 text-rose-700" aria-hidden />}
                {last.passed ? "Well done" : "Not this time"} <Stars n={last.stars} />
              </p>
              <h2 className="font-serif text-4xl">{round.mudra.name}</h2>
              <p className="text-muted-foreground">{round.mudra.meaning}</p>
              <p className="text-sm text-muted-foreground">Score {last.score}</p>
              <Button onClick={next}>
                {i + 1 < rounds.length ? "Next" : "See my score"} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="max-w-xl space-y-5">
            <p className="eyebrow">Finished</p>
            <p className="font-serif text-6xl">{total}</p>
            <p className="text-muted-foreground">
              {results.filter((r) => r.passed).length} of {rounds.length} mudras made. {newBest && <strong className="text-accent">A new best!</strong>}
            </p>
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
