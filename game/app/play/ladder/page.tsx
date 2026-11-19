"use client"

import { useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Lock, X } from "lucide-react"
import type { Mudra } from "@/lib/content"
import { buildLadder, type Level } from "@/lib/engine/ladder"
import { shuffle, seeded } from "@/lib/engine/rng"
import { recordLevel } from "@/lib/progress"
import { Button, MudraPhoto, Stars, cn } from "@/components/play/ui"
import { CameraGate } from "@/components/play/camera-gate"
import { RoundView } from "@/components/play/round-view"
import { useCamera } from "@/components/play/use-camera"
import type { RoundResult } from "@/components/play/use-round"
import { usePlay } from "@/components/play/use-play"

type View =
  | { kind: "map" }
  | { kind: "intro"; level: number }
  | { kind: "test"; level: number; items: Mudra[]; i: number; results: RoundResult[]; phase: "play" | "feedback" }
  | { kind: "result"; level: number; items: Mudra[]; results: RoundResult[]; passed: boolean; stars: 0 | 1 | 2 | 3 }

const HINT_TEXT = { photo: "Photo shown", name: "Name only", meaning: "Meaning only" } as const

function starsFor(results: RoundResult[], passed: boolean): 0 | 1 | 2 | 3 {
  const avg = results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length)
  const s = avg >= 80 ? 3 : avg >= 55 ? 2 : avg >= 30 ? 1 : 0
  return (passed ? Math.max(1, s) : Math.min(s, 1)) as 0 | 1 | 2 | 3
}

export default function LadderPage() {
  const { info, mudras, progress, update, ready, router } = usePlay()
  const cam = useCamera()
  const [view, setView] = useState<View>({ kind: "map" })
  const levels = useMemo(() => buildLadder(mudras), [mudras])
  const byId = useMemo(() => new Map(mudras.map((m) => [m.id, m])), [mudras])

  if (!info || !ready || levels.length === 0) return null
  const names = (ids: string[]) => ids.map((id) => byId.get(id)?.name ?? id).join(", ")
  const unlocked = progress.ladder.unlocked

  const startTest = (n: number) => {
    const lv = levels[n]!
    const items = shuffle([...lv.fresh, ...lv.review].map((id) => byId.get(id)!).filter(Boolean), seeded(Date.now() & 0x7fffffff))
    setView({ kind: "test", level: n, items, i: 0, results: [], phase: "play" })
  }

  const finishItem = (r: RoundResult) => {
    setView((v) => (v.kind === "test" ? { ...v, results: [...v.results, r], phase: "feedback" } : v))
  }

  const advance = () => {
    if (view.kind !== "test") return
    if (view.i + 1 < view.items.length) {
      setView({ ...view, i: view.i + 1, phase: "play" })
      return
    }
    const lv = levels[view.level]!
    const passes = view.results.filter((r) => r.passed).length
    const passed = passes >= Math.ceil(view.items.length * lv.passShare)
    const stars = starsFor(view.results, passed)
    update((p) => recordLevel(p, view.level, stars, passed))
    setView({ kind: "result", level: view.level, items: view.items, results: view.results, passed, stars })
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <button
        type="button"
        onClick={() => (view.kind === "map" ? router.push("/play") : setView({ kind: "map" }))}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {view.kind === "map" ? "Back to games" : "Back to the levels"}
      </button>
      <p className="eyebrow mb-2">{info.title} · Mudra Ladder</p>
      <h1 className="mb-8 font-serif text-4xl md:text-5xl">Climb the ladder</h1>

      {view.kind === "map" && (
        <>
          <p className="mb-8 max-w-2xl text-muted-foreground">
            Each level adds a few new mudras. You learn them, copy them with the photo in front of you, and later recall them from just the name or the meaning. The test gets a little stricter as you climb.
          </p>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {levels.map((lv) => {
              const locked = lv.index > unlocked
              const stars = progress.ladder.stars[lv.index] ?? 0
              return (
                <li key={lv.index}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setView({ kind: "intro", level: lv.index })}
                    className={cn(
                      "flex h-full w-full flex-col rounded-3xl border p-5 text-left transition",
                      locked ? "border-border bg-muted/40 opacity-70" : "border-border bg-card/70 hover:-translate-y-0.5 hover:border-accent/60",
                      lv.index === unlocked && "border-accent/60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-2xl">Level {lv.index + 1}</span>
                      {locked ? <Lock className="h-4 w-4 text-muted-foreground" aria-label="Locked" /> : <Stars n={stars} />}
                    </div>
                    <p className="mt-2 text-sm">{names(lv.fresh)}</p>
                    <p className="mt-auto pt-4 text-xs text-muted-foreground">
                      {HINT_TEXT[lv.hint]} · {lv.secondsEach} s each{lv.review.length > 0 ? ` · ${lv.review.length} review` : ""}
                    </p>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {view.kind === "intro" && <Intro level={levels[view.level]!} byId={byId} names={names} onLearn={() => router.push(`/play/learn?m=${levels[view.level]!.fresh[0]}`)} onStart={() => startTest(view.level)} />}

      {view.kind === "test" && (
        <CameraGate cam={cam} info={info}>
          {view.phase === "play" ? (
            <RoundView
              key={`${view.level}-${view.i}`}
              cam={cam}
              info={info}
              mudra={view.items[view.i]!}
              show={levels[view.level]!.hint}
              heading={`Level ${view.level + 1} · ${view.i + 1} of ${view.items.length}`}
              timeMs={levels[view.level]!.secondsEach * 1000}
              holdScale={levels[view.level]!.holdScale}
              running
              onFinish={finishItem}
            />
          ) : (
            <Feedback mudra={view.items[view.i]!} result={view.results[view.results.length - 1]!} last={view.i + 1 === view.items.length} onNext={advance} />
          )}
        </CameraGate>
      )}

      {view.kind === "result" && (
        <section className="max-w-2xl space-y-5" aria-live="polite">
          <p className="eyebrow">{view.passed ? "Level passed" : "Not quite yet"}</p>
          <h2 className="font-serif text-5xl">{view.passed ? "Well done" : "Keep practising"}</h2>
          <Stars n={view.stars} className="origin-left scale-125" />
          <p className="text-muted-foreground">
            {view.results.filter((r) => r.passed).length} of {view.items.length} mudras made. You needed {Math.ceil(view.items.length * levels[view.level]!.passShare)}.
          </p>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card/60">
            {view.items.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="inline-flex items-center gap-2">
                  {view.results[i]?.passed ? <Check className="h-4 w-4 text-emerald-700" aria-label="made" /> : <X className="h-4 w-4 text-rose-700" aria-label="missed" />}
                  {m.name}
                </span>
                <span className="text-muted-foreground">{view.results[i]?.score ?? 0}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            {view.passed && view.level + 1 < levels.length ? (
              <Button onClick={() => setView({ kind: "intro", level: view.level + 1 })}>Next level <ArrowRight className="h-4 w-4" aria-hidden /></Button>
            ) : (
              <Button onClick={() => startTest(view.level)}>Try again</Button>
            )}
            {!view.passed && <Button variant="ghost" onClick={() => router.push(`/play/learn?m=${levels[view.level]!.fresh[0]}`)}>Practise in Learn</Button>}
            <Button variant="ghost" onClick={() => setView({ kind: "map" })}>All levels</Button>
          </div>
        </section>
      )}
    </main>
  )
}

function Intro({ level, byId, names, onLearn, onStart }: { level: Level; byId: Map<string, Mudra>; names: (ids: string[]) => string; onLearn: () => void; onStart: () => void }) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl">Level {level.index + 1}</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          New in this level. In the test you will have {level.secondsEach} seconds for each mudra, with {HINT_TEXT[level.hint].toLowerCase()}
          {level.review.length > 0 ? `, and ${level.review.length} earlier ${level.review.length === 1 ? "mudra" : "mudras"} to review (${names(level.review)})` : ""}.
        </p>
      </div>
      <ul className="grid gap-5 sm:grid-cols-3">
        {level.fresh.map((id) => {
          const m = byId.get(id)!
          return (
            <li key={id} className="space-y-2">
              <MudraPhoto mudra={m} className="aspect-[4/3]" />
              <p className="font-serif text-xl">{m.name}</p>
              <p className="text-sm text-muted-foreground">{m.meaning}</p>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={onLearn}>Learn these first</Button>
        <Button onClick={onStart}>Start the test</Button>
      </div>
    </section>
  )
}

function Feedback({ mudra, result, last, onNext }: { mudra: Mudra; result: RoundResult; last: boolean; onNext: () => void }) {
  return (
    <div className="grid items-start gap-8 md:grid-cols-2" aria-live="polite">
      <MudraPhoto mudra={mudra} className="aspect-[4/3]" />
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 text-lg">
          {result.passed ? <Check className="h-5 w-5 text-emerald-700" aria-hidden /> : <X className="h-5 w-5 text-rose-700" aria-hidden />}
          {result.passed ? "Made it" : "Not this time"} <Stars n={result.stars} />
        </p>
        <h2 className="font-serif text-4xl">{mudra.name}</h2>
        <p className="text-muted-foreground">{mudra.meaning}</p>
        <Button onClick={onNext}>{last ? "See the result" : "Next"} <ArrowRight className="h-4 w-4" aria-hidden /></Button>
      </div>
    </div>
  )
}
