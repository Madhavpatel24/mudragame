import type { Mudra } from "../content/types"

// The ladder: new mudras arrive a few at a time, easiest first, and mudras that look alike are kept
// apart until later. Each level also reviews earlier mudras, and the test gets stricter step by step.

export type Level = {
  index: number
  /** Mudras introduced in this level. */
  fresh: string[]
  /** Earlier mudras mixed in for review. */
  review: string[]
  /** What the test shows the learner: the photo, only the name, or only the meaning. */
  hint: "photo" | "name" | "meaning"
  /** Seconds to make each mudra. */
  secondsEach: number
  /** Longer holds are asked for in later levels. */
  holdScale: number
  /** Share of items needed to pass. */
  passShare: number
}

const FRESH_PER_LEVEL = 3

function areLookalikes(a: Mudra, b: Mudra): boolean {
  return a.lookalikes.some((l) => l.id === b.id) || b.lookalikes.some((l) => l.id === a.id)
}

/** Easiest first, but no two look-alikes in the same level (unless nothing else is left). */
export function orderForLearning(mudras: Mudra[], perLevel = FRESH_PER_LEVEL): Mudra[][] {
  const pool = [...mudras].sort((a, b) => a.difficulty - b.difficulty)
  const groups: Mudra[][] = []
  while (pool.length) {
    const group: Mudra[] = []
    let i = 0
    while (group.length < perLevel && pool.length) {
      if (i >= pool.length) i = 0 // nothing suitable left: allow it
      const m = pool[i]!
      const clash = group.some((g) => areLookalikes(g, m))
      const onlyClashesLeft = pool.every((p) => group.some((g) => areLookalikes(g, p)))
      if (clash && !onlyClashesLeft) {
        i++
        continue
      }
      group.push(m)
      pool.splice(i, 1)
    }
    groups.push(group)
  }
  return groups
}

export function buildLadder(mudras: Mudra[]): Level[] {
  const groups = orderForLearning(mudras)
  const seen: string[] = []
  const levels = groups.length
  return groups.map((g, index) => {
    const reviewCount = index === 0 ? 0 : Math.min(seen.length, 1 + Math.floor(index / 2), 4)
    // review earlier mudras, spread over everything learned so far
    const review: string[] = []
    for (let k = 0; k < reviewCount; k++) review.push(seen[Math.floor((k * seen.length) / reviewCount)]!)
    seen.push(...g.map((m) => m.id))
    const third = levels / 3
    return {
      index,
      fresh: g.map((m) => m.id),
      review,
      hint: index < third ? "photo" : index < 2 * third ? "name" : "meaning",
      secondsEach: Math.max(8, 14 - index),
      holdScale: 1 + Math.min(0.5, index * 0.07),
      passShare: Math.min(0.8, 0.6 + index * 0.03),
    }
  })
}
