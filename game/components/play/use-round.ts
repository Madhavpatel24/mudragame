"use client"

import { useEffect, useRef, useState } from "react"
import type { Mudra } from "@/lib/content"
import { HoldTracker, type HoldRules } from "@/lib/engine/hold"
import { frameCredit, scoreAttempt, type Reading } from "@/lib/engine/scoring"
import type { Camera } from "./use-camera"

export type RoundResult = { passed: boolean; score: number; stars: 0 | 1 | 2 | 3; ms: number }

/**
 * One try at one mudra: the learner has `timeMs` to make it and hold it. The round starts when `running`
 * becomes true and ends once, either when the hold is complete or when the time runs out.
 */
export function useRound(opts: { mudra: Mudra | null; rules: HoldRules; timeMs: number; cam: Camera; running: boolean; onFinish: (r: RoundResult) => void }) {
  const { mudra, rules, timeMs, cam, running } = opts
  const finishRef = useRef(opts.onFinish)
  finishRef.current = opts.onFinish
  const [left, setLeft] = useState(timeMs)
  const [hold, setHold] = useState(0)
  const [close, setClose] = useState(0)

  useEffect(() => {
    setLeft(timeMs)
    setHold(0)
    setClose(0)
    if (!running || !mudra) return
    const tracker = new HoldTracker(mudra, rules)
    const readings: Reading[] = []
    const startedAt = performance.now()
    let over = false

    const finish = (passed: boolean) => {
      if (over) return
      over = true
      const s = scoreAttempt(mudra, readings)
      finishRef.current({ passed, score: s.score, stars: s.stars, ms: Math.round(performance.now() - startedAt) })
    }

    const off = cam.listen((r, at) => {
      if (over) return
      readings.push(r)
      setClose(frameCredit(mudra, r).credit)
      const st = tracker.feed(r, at)
      setHold(st.progress)
      if (st.done) finish(true)
    })
    const timer = setInterval(() => {
      const remaining = Math.max(0, timeMs - (performance.now() - startedAt))
      setLeft(remaining)
      if (remaining <= 0) finish(false)
    }, 100)
    return () => {
      over = true
      off()
      clearInterval(timer)
    }
    // the round restarts when the target or the running flag changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mudra?.id, running, timeMs])

  return { left, hold, close }
}
