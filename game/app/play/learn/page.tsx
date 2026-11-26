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
  const names = useRef<HTMLElement>(null)

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

  // Keep the chosen mudra visible in the list of names. Only that list scrolls, never the page.
  useEffect(() => {
    const list = names.current
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (list && item)
      list.scrollTo({
        left: item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2,
        top: item.offsetTop - (list.clientHeight - item.offsetHeight) / 2,
      })
  }, [mudra?.id, ready])

  if (!info || !ready || !mudra) return null

  const m = mastery(progress.practice[mudra.id] ?? [])
  const learnedCount = mudras.filter((x) => mastery(progress.practice[x.id] ?? []).ready).length
  const lookalikes = mudra.lookalikes.map((l) => mudras.find((x) => x.id === l.id)).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 2)
  const index = mudras.findIndex((x) => x.id === mudra.id)
  const go = (id: string) => setSelected(id)

  // Left: every mudra, as a list (a sideways row on small screens).
  const list = (
    <aside className="flex shrink-0 flex-col fit:min-h-0 fit:w-48 fit:rounded-3xl fit:border fit:border-border fit:bg-card/60 fit:p-3">
      <p className="eyebrow mb-2 hidden px-2 fit:block">
        Mudras · {learnedCount}/{mudras.length}
      </p>
      <nav
        ref={names}
        aria-label="Choose a mudra"
        className="relative flex gap-2 overflow-x-auto [scrollbar-width:none] fit:min-h-0 fit:flex-1 fit:flex-col fit:gap-1 fit:overflow-y-auto fit:overflow-x-hidden fit:[scrollbar-width:thin]"
      >
        {mudras.map((x) => {
          const mx = mastery(progress.practice[x.id] ?? [])
          const current = x.id === mudra.id
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => go(x.id)}
              aria-current={current}
              className={cn(
                "flex shrink-0 items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-left text-sm transition fit:rounded-xl fit:border-transparent",
                current ? "border-accent bg-accent text-accent-foreground fit:border-accent" : "border-border bg-background/60 hover:text-accent fit:bg-transparent fit:hover:bg-background/70"
              )}
            >
              {x.name}
              {mx.ready && <Check className={cn("h-3.5 w-3.5", !current && "text-emerald-700")} aria-label="learned" />}
            </button>
          )
        })}
      </nav>
    </aside>
  )

  // Middle: the picture to copy beside the camera.
  const reference = (
    <section className={cn("flex flex-col gap-3 fit:min-h-0", photoLeft ? "md:order-1" : "md:order-2")} aria-label="Reference">
      <div className="relative aspect-[4/3] fit:aspect-auto fit:min-h-0 fit:flex-1">
        <MudraPhoto mudra={mudra} className="absolute inset-0" />
      </div>
      {/* as tall as the button and meter under the camera, so both boxes end level */}
      <div className="fit:h-[124px]">
        <h2 className="font-serif text-2xl leading-tight md:text-3xl">{mudra.name}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mudra.meaning}</p>
      </div>
    </section>
  )

  const camera = (
    <section className={cn("flex flex-col gap-3 fit:min-h-0", photoLeft ? "md:order-2" : "md:order-1")} aria-label="Your camera">
      <CameraPanel
        cam={cam}
        handsNeeded={info.handsNeeded}
        fill
        className="fit:flex-1"
        overlay={hold > 0 ? <Meter value={hold} label="Hold it…" tone="green" /> : undefined}
      />
      <div className="fit:h-20">
        <Meter value={close} label="How close is your mudra?" />
        <p aria-live="polite" className="mt-2 flex min-h-5 items-center text-sm">
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

  // Right: what to compare with, how learning is going, and where to go next.
  const side = (
    <aside className="flex shrink-0 flex-col gap-3 fit:min-h-0 fit:w-60 fit:overflow-y-auto" aria-label="Your progress">
      {lookalikes.length > 0 && (
        <div className="rounded-3xl border border-border bg-card/60 p-4">
          <p className="eyebrow mb-3">Easy to mix up with</p>
          <div className="grid grid-cols-2 gap-3">
            {lookalikes.map((l) => (
              <button key={l.id} type="button" onClick={() => go(l.id)} title={`Compare with ${l.name}`} className="group min-w-0 text-center">
                <MudraPhoto mudra={l} className="aspect-[4/3] rounded-xl transition group-hover:border-accent/60" />
                <span className="mt-1 block truncate text-xs text-muted-foreground group-hover:text-accent">{l.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-border bg-card/60 p-4">
        <p className="eyebrow mb-3">Your progress</p>
        <Meter value={m.percent / 100} label={LEVEL_TEXT[m.level]} tone={m.ready ? "green" : "accent"} />
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {m.attempts === 0 ? "No tries yet." : `${m.attempts} ${m.attempts === 1 ? "try" : "tries"}, best score ${m.best}.`}{" "}
          {m.ready ? "You are ready for this one." : "Keep going until the bar is full."}
        </p>
      </div>

      <div className="flex flex-col gap-2 fit:mt-auto">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="sm" onClick={() => go(mudras[(index - 1 + mudras.length) % mudras.length]!.id)}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Previous
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go(mudras[(index + 1) % mudras.length]!.id)}>
            Next <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            update((p) => markLearned(p, mudra.id))
            go(mudras[(index + 1) % mudras.length]!.id)
          }}
        >
          <Check className="h-4 w-4" aria-hidden /> I&apos;ve learned this
        </Button>
        <Button onClick={() => router.push("/play")}>
          Go to the games <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </aside>
  )

  // On a laptop everything fits on one screen across its full width. On smaller screens the parts
  // stack at full size and the page scrolls.
  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-4 py-3 fit:h-dvh fit:overflow-hidden md:px-6 md:py-4">
      {/* equal outer columns keep the title in the middle of the page */}
      <header className="grid shrink-0 grid-cols-[minmax(2.75rem,1fr)_auto_minmax(2.75rem,1fr)] items-center gap-3">
        <button type="button" onClick={() => router.push("/play")} className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground transition hover:text-accent">
          <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Back to games</span>
        </button>
        <div className="min-w-0 text-center">
          <p className="eyebrow hidden sm:block">{info.title} · Learn</p>
          <h1 className="truncate font-serif text-xl leading-tight md:text-2xl">Learn the mudras</h1>
        </div>
        <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => setPhotoLeft((v) => !v)} aria-label="Swap the photo and the camera">
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Photo on the {photoLeft ? "left" : "right"}</span>
        </Button>
      </header>

      <div className="flex flex-col gap-4 fit:min-h-0 fit:flex-1 fit:flex-row fit:gap-5">
        {list}
        <div className="grid min-w-0 grid-cols-1 gap-5 fit:min-h-0 fit:flex-1 md:grid-cols-2">
          {reference}
          {camera}
        </div>
        {side}
      </div>
    </main>
  )
}
