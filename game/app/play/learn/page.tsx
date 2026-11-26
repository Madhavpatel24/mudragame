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
  // keep the selected mudra visible in the single row of names
  const showChip = (el: HTMLButtonElement | null) => el?.scrollIntoView({ block: "nearest", inline: "nearest" })

  const reference = (
    <section className={cn("flex min-h-0 flex-col gap-2", photoLeft ? "md:order-1" : "md:order-2")} aria-label="Reference">
      <div className="relative min-h-0 flex-1">
        <MudraPhoto mudra={mudra} className="absolute inset-0" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl leading-tight md:text-2xl">{mudra.name}</h2>
          <p className="line-clamp-2 text-xs text-muted-foreground md:text-sm">{mudra.meaning}</p>
        </div>
        {lookalikes.length > 0 && (
          <div className="flex shrink-0 items-end gap-2">
            <p className="hidden max-w-20 self-center text-right text-xs leading-tight text-muted-foreground lg:block">Easy to mix up with</p>
            {lookalikes.map((l) => (
              <button key={l.id} type="button" onClick={() => go(l.id)} title={`Compare with ${l.name}`} className="group w-14 text-center md:w-20">
                <MudraPhoto mudra={l} className="h-9 rounded-lg transition group-hover:border-accent/60 md:h-12" />
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground group-hover:text-accent md:text-xs">{l.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )

  const camera = (
    <section className={cn("flex min-h-0 flex-col", photoLeft ? "md:order-2" : "md:order-1")} aria-label="Your camera">
      <CameraPanel
        cam={cam}
        handsNeeded={info.handsNeeded}
        fill
        className="flex-1"
        overlay={hold > 0 ? <Meter value={hold} label="Hold it…" tone="green" /> : undefined}
        aside={
          <div className="min-w-40 flex-1">
            <Meter value={close} label="How close is your mudra?" />
          </div>
        }
      />
      <p aria-live="polite" className="mt-1 flex h-5 items-center truncate text-xs md:text-sm">
        {flash ? (
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-700" aria-hidden /> Held. Score {flash.score}
            <Stars n={flash.stars} />
          </span>
        ) : (
          <span className="text-muted-foreground">Make the mudra and hold it still for a moment.</span>
        )}
      </p>
    </section>
  )

  // Everything fits on one screen: the picture and the camera share whatever height is left over.
  return (
    <main className="mx-auto flex h-dvh max-w-6xl flex-col gap-2 overflow-hidden px-4 py-3 md:gap-3 md:px-6 md:py-4">
      <header className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={() => router.push("/play")} className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
          <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Back to games</span>
        </button>
        <div className="min-w-0">
          <p className="eyebrow hidden sm:block">{info.title} · Learn</p>
          <h1 className="truncate font-serif text-xl leading-tight md:text-2xl">Learn the mudras</h1>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => setPhotoLeft((v) => !v)} aria-label="Swap the photo and the camera">
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Photo on the {photoLeft ? "left" : "right"}</span>
          <span className="sm:hidden">Swap</span>
        </Button>
      </header>

      <nav aria-label="Choose a mudra" className="flex shrink-0 gap-2 overflow-x-auto [scrollbar-width:none]">
        {mudras.map((x) => {
          const mx = mastery(progress.practice[x.id] ?? [])
          return (
            <button
              key={x.id}
              ref={x.id === mudra.id ? showChip : undefined}
              type="button"
              onClick={() => go(x.id)}
              aria-current={x.id === mudra.id}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs transition md:text-sm",
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

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 md:grid-cols-2 md:grid-rows-1 md:gap-6">
        {reference}
        {camera}
      </div>

      <section className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-card/70 px-4 py-2.5" aria-label="Your progress">
        <div className="min-w-52 flex-1">
          <Meter value={m.percent / 100} label={`${mudra.name}: ${LEVEL_TEXT[m.level].toLowerCase()}`} tone={m.ready ? "green" : "accent"} />
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {m.attempts === 0 ? "No tries yet." : `${m.attempts} ${m.attempts === 1 ? "try" : "tries"}, best ${m.best}.`} {learnedCount} of {mudras.length} ready.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <Button variant="ghost" size="sm" onClick={() => go(mudras[(index - 1 + mudras.length) % mudras.length]!.id)}>Previous</Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              update((p) => markLearned(p, mudra.id))
              go(mudras[(index + 1) % mudras.length]!.id)
            }}
          >
            Learned, next
          </Button>
          <Button size="sm" onClick={() => router.push("/play")}>
            <span className="hidden md:inline">I feel ready, go to the games</span>
            <span className="md:hidden">Go to games</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </section>
    </main>
  )
}
