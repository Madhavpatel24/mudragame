"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, ArrowLeftRight, Check } from "lucide-react"
import { HoldTracker } from "@/lib/engine/hold"
import { mastery } from "@/lib/engine/mastery"
import { frameCredit, scoreAttempt, type Reading } from "@/lib/engine/scoring"
import { addPractice, markLearned } from "@/lib/progress"
import { Button, Meter, MudraPhoto, Stars, cn } from "@/components/play/ui"
import { CameraPanel } from "@/components/play/camera-panel"
import { useCamera } from "@/components/play/use-camera"
import { usePlay } from "@/components/play/use-play"

const LEVEL_TEXT = ["Just starting", "Getting there", "Ready", "Mastered"]

export default function Learn() {
  const { info, mudras, progress, update, ready, router } = usePlay()
  const cam = useCamera()
  const [selected, setSelected] = useState<string | null>(null)
  const [photoLeft, setPhotoLeft] = useState(true)
  const [close, setClose] = useState(0)
  const [hold, setHold] = useState(0)
  const [flash, setFlash] = useState<{ score: number; stars: 0 | 1 | 2 | 3 } | null>(null)
  const startedFor = useRef(false)

  // Open on the first mudra that is not yet ready.
  useEffect(() => {
    if (!ready || startedFor.current || mudras.length === 0) return
    startedFor.current = true
    // a link can ask for a particular mudra, for example from the ladder
    const asked = new URLSearchParams(window.location.search).get("m")
    const next = mudras.find((m) => m.id === asked) ?? mudras.find((m) => !mastery(progress.practice[m.id] ?? []).ready) ?? mudras[0]!
    setSelected(next.id)
  }, [ready, mudras, progress.practice])

  const mudra = useMemo(() => mudras.find((m) => m.id === selected) ?? null, [mudras, selected])

  // Watch the camera: how close is the pose, and has it been held long enough to count as an attempt?
  useEffect(() => {
    setClose(0)
    setHold(0)
    setFlash(null)
    if (!mudra || !info) return
    const id = mudra.id
    let tracker = new HoldTracker(mudra, info.hold)
    let recent: Reading[] = []
    return cam.listen((r, at) => {
      recent = [...recent, r].slice(-Math.max(4, Math.round(1500 / info.sampleIntervalMs) + 2))
      setClose(frameCredit(mudra, r).credit)
      const st = tracker.feed(r, at)
      setHold(st.progress)
      if (st.done) {
        const s = scoreAttempt(mudra, recent)
        update((p) => addPractice(p, id, s.score))
        setFlash({ score: s.score, stars: s.stars })
        tracker = new HoldTracker(mudra, info.hold)
        recent = []
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mudra?.id, info?.id])

  if (!info || !ready || !mudra) return null

  const m = mastery(progress.practice[mudra.id] ?? [])
  const learnedCount = mudras.filter((x) => mastery(progress.practice[x.id] ?? []).ready).length
  const lookalikes = mudra.lookalikes.map((l) => mudras.find((x) => x.id === l.id)).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 2)
  const index = mudras.findIndex((x) => x.id === mudra.id)
  const go = (id: string) => setSelected(id)

  const reference = (
    <section className={cn("space-y-4", photoLeft ? "md:order-1" : "md:order-2")} aria-label="Reference">
      <MudraPhoto mudra={mudra} className="aspect-[4/3]" />
      <div>
        <h2 className="font-serif text-3xl">{mudra.name}</h2>
        <p className="mt-1 text-muted-foreground">{mudra.meaning}</p>
      </div>
      {lookalikes.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <p className="text-sm text-muted-foreground">Easy to mix up with. Look closely at the difference:</p>
          <div className="mt-3 flex gap-3">
            {lookalikes.map((l) => (
              <button key={l.id} type="button" onClick={() => go(l.id)} className="group w-28 text-left">
                <MudraPhoto mudra={l} className="aspect-[4/3] transition group-hover:border-accent/60" />
                <span className="mt-1 block text-xs group-hover:text-accent">{l.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )

  const camera = (
    <section className={cn("space-y-4", photoLeft ? "md:order-2" : "md:order-1")} aria-label="Your camera">
      <CameraPanel
        cam={cam}
        handsNeeded={info.handsNeeded}
        overlay={hold > 0 ? <Meter value={hold} label="Hold it…" tone="green" /> : undefined}
      />
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <Meter value={close} label="How close is your mudra?" />
        <p aria-live="polite" className="mt-3 min-h-5 text-sm">
          {flash ? (
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-700" aria-hidden /> Held. Score {flash.score}
              <Stars n={flash.stars} />
            </span>
          ) : (
            <span className="text-muted-foreground">Make the mudra and hold it still for a moment.</span>
          )}
        </p>
      </div>
    </section>
  )

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <button type="button" onClick={() => router.push("/play")} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{info.title} · Learn</p>
          <h1 className="font-serif text-4xl md:text-5xl">Learn the mudras</h1>
        </div>
        <Button variant="ghost" onClick={() => setPhotoLeft((v) => !v)} aria-label="Swap the photo and the camera">
          <ArrowLeftRight className="h-4 w-4" aria-hidden /> Photo on the {photoLeft ? "left" : "right"}
        </Button>
      </div>

      <nav aria-label="Choose a mudra" className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {mudras.map((x) => {
          const mx = mastery(progress.practice[x.id] ?? [])
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => go(x.id)}
              aria-current={x.id === mudra.id}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-sm transition",
                x.id === mudra.id ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background/60 hover:border-accent/50",
                x.id !== mudra.id && mx.ready && "border-emerald-600/50"
              )}
            >
              {x.name}
              {mx.ready && <Check className="ml-1.5 inline h-3.5 w-3.5" aria-label="learned" />}
            </button>
          )
        })}
      </nav>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {reference}
        {camera}
      </div>

      <section className="mt-10 grid gap-6 rounded-3xl border border-border bg-card/70 p-6 md:grid-cols-3 md:p-8" aria-label="Your progress">
        <div>
          <p className="eyebrow mb-2">{mudra.name}</p>
          <Meter value={m.percent / 100} label={LEVEL_TEXT[m.level]} tone={m.ready ? "green" : "accent"} />
          <p className="mt-3 text-sm text-muted-foreground">
            {m.attempts === 0
              ? "No tries yet."
              : `${m.attempts} ${m.attempts === 1 ? "try" : "tries"}, best score ${m.best}.`}{" "}
            {m.ready ? "You are ready for this one." : "Keep going until the bar is full."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:justify-center">
          <Button variant="ghost" onClick={() => go(mudras[(index - 1 + mudras.length) % mudras.length]!.id)}>Previous</Button>
          <Button
            variant="ghost"
            onClick={() => {
              update((p) => markLearned(p, mudra.id))
              go(mudras[(index + 1) % mudras.length]!.id)
            }}
          >
            I&apos;ve learned this, next
          </Button>
        </div>
        <div className="md:text-right">
          <Button onClick={() => router.push("/play")}>
            I feel ready, go to the games <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {learnedCount} of {mudras.length} mudras ready. You can come back to learn at any time.
          </p>
        </div>
      </section>
    </main>
  )
}
