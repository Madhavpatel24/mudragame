import type { Mudra } from "../content/types"
import { accepted, type Reading } from "./scoring"

export type HoldRules = {
  /** The pose must stay right for at least this long. */
  holdMs: number
  /** ...and across at least this many readings (a slow server gives fewer readings). */
  minReadings: number
  /** One missed reading is forgiven if the next one is right again within this time. */
  graceMs: number
}

export type HoldState = { holding: boolean; heldMs: number; readings: number; done: boolean; progress: number }

/** Decides when the learner has "made" the mudra: right for long enough, without a blip resetting it. */
export class HoldTracker {
  private startedAt: number | null = null
  private lastGoodAt = 0
  private count = 0
  private done = false

  constructor(private readonly target: Mudra, private readonly rules: HoldRules) {}

  feed(r: Reading, now: number): HoldState {
    if (this.done) return this.state()
    if (accepted(this.target, r)) {
      if (this.startedAt === null) {
        this.startedAt = now
        this.count = 0
      }
      this.lastGoodAt = now
      this.count++
      if (now - this.startedAt >= this.rules.holdMs && this.count >= this.rules.minReadings) this.done = true
    } else if (this.startedAt !== null && now - this.lastGoodAt > this.rules.graceMs) {
      this.startedAt = null
      this.count = 0
    }
    return this.state()
  }

  reset(): void {
    this.startedAt = null
    this.count = 0
    this.done = false
  }

  private state(): HoldState {
    const heldMs = this.startedAt === null ? 0 : this.lastGoodAt - this.startedAt
    const progress = this.done ? 1 : Math.min(0.99, Math.max(heldMs / this.rules.holdMs, this.count / this.rules.minReadings))
    return { holding: this.startedAt !== null, heldMs, readings: this.count, done: this.done, progress }
  }
}
