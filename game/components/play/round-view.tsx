"use client"

import { useMemo } from "react"
import type { Mudra } from "@/lib/content"
import type { HoldRules } from "@/lib/engine/hold"
import type { ModeInfo } from "@/lib/modes"
import { CameraPanel } from "./camera-panel"
import { Meter, MudraPhoto } from "./ui"
import type { Camera } from "./use-camera"
import { useRound, type RoundResult } from "./use-round"

/** What the learner is shown as the target. */
export type Show = "photo" | "name" | "meaning" | "none"

/** One round on screen: the target on one side, the camera on the other, a timer and a hold meter. */
export function RoundView({
  cam,
  info,
  mudra,
  show,
  prompt,
  heading,
  timeMs,
  holdScale = 1,
  running,
  onFinish,
}: {
  cam: Camera
  info: ModeInfo
  mudra: Mudra
  show: Show
  /** Replaces the target display, for example "Show me: a peacock". */
  prompt?: string
  heading?: string
  timeMs: number
  holdScale?: number
  running: boolean
  onFinish: (r: RoundResult) => void
}) {
  const rules = useMemo<HoldRules>(() => ({ ...info.hold, holdMs: info.hold.holdMs * holdScale }), [info.hold, holdScale])
  const { left, hold, close } = useRound({ mudra, rules, timeMs, cam, running, onFinish })

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section aria-label="Target" className="space-y-4">
        <div>
          <p className="eyebrow mb-1">{heading ?? "Make this mudra"}</p>
          <Meter value={left / timeMs} label={`${Math.ceil(left / 1000)} s left`} />
        </div>
        {prompt ? (
          <div className="grid aspect-[4/3] place-items-center rounded-2xl border border-border bg-card/70 p-6 text-center">
            <p className="font-serif text-3xl leading-snug md:text-4xl">{prompt}</p>
          </div>
        ) : show === "photo" ? (
          <>
            <MudraPhoto mudra={mudra} className="aspect-[4/3]" />
            <p className="font-serif text-2xl">{mudra.name}</p>
          </>
        ) : show === "name" ? (
          <div className="grid aspect-[4/3] place-items-center rounded-2xl border border-border bg-card/70 p-6 text-center">
            <p className="font-serif text-5xl">{mudra.name}</p>
          </div>
        ) : show === "meaning" ? (
          <div className="grid aspect-[4/3] place-items-center rounded-2xl border border-border bg-card/70 p-6 text-center">
            <p className="font-serif text-3xl leading-snug">{mudra.meaning}</p>
          </div>
        ) : (
          <div className="grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
            Make it from memory.
          </div>
        )}
        <Meter value={close} label="How close" />
      </section>
      <CameraPanel cam={cam} handsNeeded={info.handsNeeded} overlay={hold > 0 ? <Meter value={hold} label="Hold it…" tone="green" /> : undefined} />
    </div>
  )
}
