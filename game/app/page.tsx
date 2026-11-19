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

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10 md:px-6 md:py-16">
      <header className="mb-14 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent font-serif text-lg text-accent-foreground" aria-hidden>
          ॐ
        </span>
        <span className="font-serif text-xl">
          Nritya<span className="text-accent">Netra</span>
        </span>
      </header>

      <section className="rise-in max-w-2xl">
        <p className="eyebrow mb-4">Mudra practice</p>
        <h1 className="font-serif text-4xl leading-tight md:text-6xl">What would you like to practise?</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Choose one to begin. You can switch any time from the start screen, and your progress for each is kept separately.
        </p>
      </section>

      <div role="group" aria-label="Mudra type" className="mt-12 grid gap-6 md:grid-cols-2">
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

      <p className="mt-auto pt-14 text-sm text-muted-foreground">
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
        "flex flex-col rounded-3xl border bg-card/70 p-7 transition md:p-8",
        loading ? "border-accent/60 shadow-[0_18px_40px_-26px_rgba(74,44,0,0.5)]" : "border-border hover:border-accent/50",
        error && "border-rose-300/70"
      )}
    >
      <div className="flex items-center justify-between">
        <Hands n={mode.handsNeeded} />
        <span className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
          {mode.handsNeeded === 1 ? "One hand" : "Both hands"}
        </span>
      </div>

      <h2 className="mt-6 font-serif text-3xl">{mode.title}</h2>
      <p className="eyebrow mt-1">{mode.tagline}</p>
      <p className="mt-4 leading-relaxed text-muted-foreground">{mode.description}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        {mode.mudraCount} mudras · {mode.runsOn === "device" ? "runs on your device" : "uses a model server"}
      </p>

      <div className="mt-8 min-h-[5.5rem]">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-4 text-sm">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden />
            <span className="text-muted-foreground">
              {mode.loadingNote}
              {elapsedMs > 0 && <span className="mt-1 block text-xs">Waiting for the server: {Math.round(elapsedMs / 1000)}s</span>}
            </span>
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3">
            <p className="flex items-start gap-2 rounded-2xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {serverDown
                  ? "The model server for this mode isn't available right now."
                  : "This mode couldn't be loaded. Check your connection and try again."}
                {serverDown && <span className="mt-1 block text-xs text-rose-800/80">Server: {SAMYUKTA_URL}</span>}
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
            className="group inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-accent-foreground transition hover:bg-accent/90"
          >
            Choose {mode.title}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
