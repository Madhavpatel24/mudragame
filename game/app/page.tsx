"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowRight, Hand, Loader2, RotateCw } from "lucide-react"
import { SamyuktaServerError } from "@switcher"
import { MODE_INFO, SAMYUKTA_URL, type ModeInfo } from "@/lib/modes"
import { useMode } from "@/components/mode-provider"

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

function Hands({ n }: { n: 1 | 2 }) {
  return (
    <span className="flex items-center -space-x-1.5" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <Hand key={i} className={cn("h-7 w-7 text-accent", i === 1 && "-scale-x-100")} strokeWidth={1.5} />
      ))}
    </span>
  )
}

export default function ModeScreen() {
  const router = useRouter()
  const { manager, state, waking } = useMode()
  const chose = useRef(false)

  // The mode is chosen here and only here. Arriving back at this screen releases the old model.
  useEffect(() => {
    chose.current = false
    void manager.dispose()
  }, [manager])

  useEffect(() => {
    if (chose.current && state.status === "ready") router.push("/play")
  }, [state.status, router])

  const choose = (id: string) => {
    chose.current = true
    void manager.select(id)
  }

  const modes = Object.values(MODE_INFO)
  const loadingId = state.status === "loading" ? state.mode : null
  const errorId = state.status === "error" ? state.mode : null

  // The whole screen fits in the window: spacing and type shrink on short or narrow screens.
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-3 md:px-6 md:py-5">
      <header className="flex shrink-0 items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent font-serif text-lg text-accent-foreground" aria-hidden>
          ॐ
        </span>
        <span className="font-serif text-xl">
          Nritya<span className="text-accent">Netra</span>
        </span>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-4 py-3 md:gap-[min(3rem,5vh)]">
        <section className="rise-in mx-auto max-w-3xl text-center">
          <p className="eyebrow mb-2">Mudra practice</p>
          <h1 className="font-serif text-[clamp(1.6rem,min(6vw,6.5vh),3.5rem)] leading-tight">What would you like to practise?</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-sm:hidden md:text-base short:hidden">
            Choose one to begin. You can switch any time from the start screen, and your progress for each is kept separately.
          </p>
        </section>

        <div role="group" aria-label="Mudra type" className="grid gap-3 md:grid-cols-2 md:gap-6">
          {modes.map((m) => (
            <ModeCard
              key={m.id}
              mode={m}
              loading={loadingId === m.id}
              error={errorId === m.id ? state.error : null}
              elapsedMs={loadingId === m.id && m.runsOn === "server" ? (waking?.elapsedMs ?? 0) : 0}
              onChoose={() => choose(m.id)}
            />
          ))}
        </div>
      </div>

      <p className="shrink-0 text-center text-xs text-muted-foreground">
        Your camera is used only while you practise. Single-hand mudras are recognised on your device.
      </p>
    </main>
  )
}

function ModeCard({
  mode,
  loading,
  error,
  elapsedMs,
  onChoose,
}: {
  mode: ModeInfo
  loading: boolean
  error: Error | null
  elapsedMs: number
  onChoose: () => void
}) {
  const serverDown = error instanceof SamyuktaServerError
  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl border bg-card/70 p-4 transition md:p-[min(2rem,3.5vh)]",
        loading ? "border-accent/60 shadow-[0_18px_40px_-26px_rgba(74,44,0,0.5)]" : "border-border hover:border-accent/50",
        error && "border-rose-300/70"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Hands n={mode.handsNeeded} />
        <span className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
          {mode.handsNeeded === 1 ? "One hand" : "Both hands"}
        </span>
      </div>

      <h2 className="mt-2 font-serif text-2xl md:mt-[min(1.25rem,2vh)] md:text-3xl">{mode.title}</h2>
      <p className="eyebrow mt-0.5">{mode.tagline}</p>
      <p className="mt-[min(0.75rem,1.5vh)] text-sm leading-relaxed text-muted-foreground max-sm:hidden md:text-base">{mode.description}</p>
      <p className="mt-1 text-xs text-muted-foreground md:mt-[min(0.75rem,1.5vh)] md:text-sm">
        {mode.mudraCount} mudras · {mode.runsOn === "device" ? "runs on your device" : "uses a model server"}
      </p>

      <div className="mt-auto flex min-h-12 items-end pt-3 md:pt-[min(1.5rem,2.5vh)]">
        {loading ? (
          <div role="status" aria-live="polite" className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background/60 px-3 py-2 text-xs md:text-sm">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden />
            <span className="text-muted-foreground">
              {mode.loadingNote}
              {elapsedMs > 0 && <span className="block text-xs">Waiting for the server: {Math.round(elapsedMs / 1000)}s</span>}
            </span>
          </div>
        ) : error ? (
          <div role="alert" className="flex w-full flex-wrap items-center gap-2">
            <p className="flex min-w-0 flex-1 items-start gap-2 rounded-2xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs text-rose-900 md:text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span title={serverDown ? `Server: ${SAMYUKTA_URL}` : undefined}>
                {serverDown
                  ? "The model server for this mode isn't available right now."
                  : "This mode couldn't be loaded. Check your connection and try again."}
              </span>
            </p>
            <button
              type="button"
              onClick={onChoose}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-sm transition hover:border-accent/60 hover:text-accent"
            >
              <RotateCw className="h-4 w-4" aria-hidden /> Try again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onChoose}
            className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 md:px-7 md:py-3"
          >
            Choose {mode.title}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
