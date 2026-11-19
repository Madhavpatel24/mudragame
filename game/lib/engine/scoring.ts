import type { Prediction } from "@switcher"
import type { Mudra } from "../content/types"

// Scoring follows the idea in Aparna's demo.md: how strongly the model sees the target mudra,
// how often it is the top guess, and the best moment. One addition: when the model's top guess is a
// mudra it often mixes up with the target, the learner gets partial credit instead of nothing.

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
export const LOOKALIKE_CREDIT = 0.5

export type Reading = Pick<Prediction, "top" | "handsSeen">

/** How well a single reading matches the target, 0 to 1. A reading with no hand scores 0. */
export function frameCredit(target: Mudra, r: Reading): { credit: number; hit: boolean; lookalike: boolean } {
  if (r.handsSeen === 0 || r.top.length === 0) return { credit: 0, hit: false, lookalike: false }
  const mine = r.top.find((g) => key(g.label) === key(target.id))?.prob ?? 0
  const first = r.top[0]!
  const hit = key(first.label) === key(target.id)
  const lookalike = !hit && target.lookalikes.some((l) => key(l.id) === key(first.label))
  const credit = Math.min(1, mine + (lookalike ? LOOKALIKE_CREDIT * first.prob : 0))
  return { credit, hit, lookalike }
}

/** For weaker mudras the second guess is also accepted, so a correct pose is not marked wrong. */
export function accepted(target: Mudra, r: Reading): boolean {
  if (r.handsSeen === 0 || r.top.length === 0) return false
  const limit = target.strict ? 1 : 2
  return r.top.slice(0, limit).some((g) => key(g.label) === key(target.id))
}

export type AttemptScore = { score: number; stars: 0 | 1 | 2 | 3; avgCredit: number; hitRate: number; peak: number; frames: number }

export function scoreAttempt(target: Mudra, readings: Reading[]): AttemptScore {
  if (readings.length === 0) return { score: 0, stars: 0, avgCredit: 0, hitRate: 0, peak: 0, frames: 0 }
  const f = readings.map((r) => frameCredit(target, r))
  const avgCredit = f.reduce((s, x) => s + x.credit, 0) / f.length
  const hitRate = f.filter((x) => x.hit).length / f.length
  const peak = Math.max(...f.map((x) => x.credit))
  const score = Math.round(100 * (0.5 * avgCredit + 0.3 * hitRate + 0.2 * peak))
  const stars = score >= 80 ? 3 : score >= 55 ? 2 : score >= 30 ? 1 : 0
  return { score, stars, avgCredit, hitRate, peak, frames: readings.length }
}
