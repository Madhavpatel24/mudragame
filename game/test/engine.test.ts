import { describe, expect, it } from "vitest"
import type { Mudra } from "../lib/content/types"
import { HoldTracker, type HoldRules } from "../lib/engine/hold"
import { buildLadder, orderForLearning } from "../lib/engine/ladder"
import { mastery } from "../lib/engine/mastery"
import { seeded, shuffle } from "../lib/engine/rng"
import { accepted, frameCredit, scoreAttempt, type Reading } from "../lib/engine/scoring"

const mudra = (id: string, over: Partial<Mudra> = {}): Mudra => ({
  id, name: id, meaning: id, uses: [id], photo: `/${id}.jpg`, lookalikes: [], difficulty: 0.5, strict: true, ...over,
})
const read = (top: [string, number][], handsSeen: number | null = 1): Reading => ({ top: top.map(([label, prob]) => ({ label, prob })), handsSeen })

describe("scoring", () => {
  const target = mudra("Mayura", { lookalikes: [{ id: "Mukula", share: 0.2 }] })

  it("gives full credit for a confident, correct reading", () => {
    const f = frameCredit(target, read([["Mayura", 0.9], ["Suchi", 0.1]]))
    expect(f).toMatchObject({ hit: true, lookalike: false })
    expect(f.credit).toBeCloseTo(0.9)
  })

  it("gives nothing when no hand is seen", () => {
    expect(frameCredit(target, read([["Mayura", 0.9]], 0)).credit).toBe(0)
    expect(frameCredit(target, read([]))).toMatchObject({ credit: 0, hit: false })
  })

  it("gives partial credit when the top guess is a known look-alike", () => {
    const f = frameCredit(target, read([["Mukula", 0.7], ["Mayura", 0.2]]))
    expect(f.hit).toBe(false)
    expect(f.lookalike).toBe(true)
    expect(f.credit).toBeCloseTo(0.2 + 0.5 * 0.7)
  })

  it("gives no look-alike credit for an unrelated wrong guess", () => {
    expect(frameCredit(target, read([["Suchi", 0.7], ["Mayura", 0.2]])).credit).toBeCloseTo(0.2)
  })

  it("never goes above 1", () => {
    expect(frameCredit(target, read([["Mukula", 0.99], ["Mayura", 0.9]])).credit).toBeLessThanOrEqual(1)
  })

  it("accepts only the top guess for strict mudras and the top two for lenient ones", () => {
    const second = read([["Suchi", 0.5], ["Mayura", 0.4]])
    expect(accepted(mudra("Mayura", { strict: true }), second)).toBe(false)
    expect(accepted(mudra("Mayura", { strict: false }), second)).toBe(true)
    expect(accepted(mudra("Mayura", { strict: false }), read([["Mayura", 0.9]], 0))).toBe(false)
  })

  it("scores an attempt like the documented formula", () => {
    const rs = [read([["Mayura", 0.7]]), read([["Mayura", 0.7]]), read([["Suchi", 0.5], ["Mayura", 0.1]]), read([["Mayura", 0.9]])]
    const s = scoreAttempt(target, rs)
    expect(s.hitRate).toBeCloseTo(0.75)
    expect(s.peak).toBeCloseTo(0.9)
    expect(s.score).toBe(Math.round(100 * (0.5 * ((0.7 + 0.7 + 0.1 + 0.9) / 4) + 0.3 * 0.75 + 0.2 * 0.9)))
  })

  it("scores an empty attempt as zero and maps scores to stars", () => {
    expect(scoreAttempt(target, [])).toMatchObject({ score: 0, stars: 0 })
    const strong = scoreAttempt(target, [read([["Mayura", 0.95]]), read([["Mayura", 0.95]])])
    expect(strong.stars).toBe(3)
    const weak = scoreAttempt(target, [read([["Suchi", 0.9]])])
    expect(weak.stars).toBe(0)
  })
})

describe("hold tracker", () => {
  const rules: HoldRules = { holdMs: 1000, minReadings: 3, graceMs: 300 }
  const good = read([["Mayura", 0.9]])
  const bad = read([["Suchi", 0.9]])

  it("completes after holding long enough across enough readings", () => {
    const h = new HoldTracker(mudra("Mayura"), rules)
    let s = h.feed(good, 0)
    s = h.feed(good, 400)
    expect(s.done).toBe(false)
    s = h.feed(good, 1000)
    expect(s.done).toBe(true)
    expect(s.progress).toBe(1)
  })

  it("needs enough readings, not just enough time", () => {
    const h = new HoldTracker(mudra("Mayura"), { ...rules, minReadings: 5 })
    h.feed(good, 0)
    expect(h.feed(good, 1500).done).toBe(false)
  })

  it("forgives one short miss but resets after a long one", () => {
    const h = new HoldTracker(mudra("Mayura"), rules)
    h.feed(good, 0)
    h.feed(good, 200)
    h.feed(bad, 350) // within grace
    expect(h.feed(good, 500).heldMs).toBe(500)
    h.feed(bad, 900)
    h.feed(bad, 1300) // grace passed
    expect(h.feed(bad, 1400)).toMatchObject({ holding: false, heldMs: 0 })
  })

  it("stays done once done, and can be reset", () => {
    const h = new HoldTracker(mudra("Mayura"), rules)
    h.feed(good, 0)
    h.feed(good, 500)
    h.feed(good, 1000)
    expect(h.feed(bad, 5000).done).toBe(true)
    h.reset()
    expect(h.feed(bad, 6000).done).toBe(false)
  })

  it("a lenient mudra counts the second guess towards the hold", () => {
    const h = new HoldTracker(mudra("Mayura", { strict: false }), rules)
    const second = read([["Suchi", 0.5], ["Mayura", 0.4]])
    h.feed(second, 0)
    h.feed(second, 500)
    expect(h.feed(second, 1000).done).toBe(true)
  })
})

describe("mastery", () => {
  it("is not ready without practice", () => {
    expect(mastery([])).toMatchObject({ ready: false, level: 0, percent: 0 })
    expect(mastery([95]).ready).toBe(false) // one lucky try is not enough
  })

  it("is ready once the best recent attempts are good", () => {
    expect(mastery([60, 75, 80]).ready).toBe(true) // average of the best three is about 72
    expect(mastery([40, 75, 80]).ready).toBe(false) // about 65: close, but not yet
    expect(mastery([30, 40, 35]).ready).toBe(false)
  })

  it("only looks at recent attempts and shows progress", () => {
    const m = mastery([5, 5, 5, 5, 90, 90, 90, 90, 90])
    expect(m.ready).toBe(true)
    expect(m.level).toBe(3)
    expect(mastery([35, 35]).percent).toBe(50)
  })

  it("only shows a full bar when the mudra is ready", () => {
    expect(mastery([95]).percent).toBeLessThan(100)
    expect(mastery([71]).percent).toBeLessThan(100)
    expect(mastery([75, 80]).percent).toBe(100)
    expect(mastery([69, 69, 69]).percent).toBeLessThan(100)
  })
})

describe("ladder", () => {
  const many = Array.from({ length: 10 }, (_, i) => mudra(`M${i}`, { difficulty: i / 10 }))

  it("introduces every mudra exactly once, easiest first", () => {
    const levels = buildLadder(many)
    const fresh = levels.flatMap((l) => l.fresh)
    expect(fresh).toHaveLength(10)
    expect(new Set(fresh).size).toBe(10)
    expect(fresh[0]).toBe("M0")
    expect(levels[0]!.fresh).toEqual(["M0", "M1", "M2"])
  })

  it("starts without review and adds more as it goes", () => {
    const levels = buildLadder(many)
    expect(levels[0]!.review).toEqual([])
    expect(levels[levels.length - 1]!.review.length).toBeGreaterThan(levels[1]!.review.length - 1)
    for (const l of levels) for (const r of l.review) expect(l.fresh).not.toContain(r)
  })

  it("gets harder: less time, longer holds, hints removed, higher pass mark", () => {
    const levels = buildLadder(many)
    const a = levels[0]!, z = levels[levels.length - 1]!
    expect(z.secondsEach).toBeLessThanOrEqual(a.secondsEach)
    expect(z.holdScale).toBeGreaterThan(a.holdScale)
    expect(z.passShare).toBeGreaterThanOrEqual(a.passShare)
    expect(a.hint).toBe("photo")
    expect(z.hint).toBe("meaning")
  })

  it("keeps look-alikes in different levels when it can", () => {
    const m = [
      mudra("A", { difficulty: 0.1, lookalikes: [{ id: "B", share: 0.3 }] }),
      mudra("B", { difficulty: 0.11 }),
      mudra("C", { difficulty: 0.12 }),
      mudra("D", { difficulty: 0.13 }),
      mudra("E", { difficulty: 0.14 }),
      mudra("F", { difficulty: 0.15 }),
    ]
    const groups = orderForLearning(m)
    const withA = groups.find((g) => g.some((x) => x.id === "A"))!
    expect(withA.some((x) => x.id === "B")).toBe(false)
    expect(groups.flat()).toHaveLength(6)
  })

  it("still places look-alikes together when nothing else is left", () => {
    const m = [mudra("A", { lookalikes: [{ id: "B", share: 0.5 }] }), mudra("B")]
    expect(orderForLearning(m).flat()).toHaveLength(2)
  })
})

describe("seeded random", () => {
  it("gives the same sequence for the same seed, and a different one otherwise", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seeded(42))
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seeded(42))
    const c = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seeded(43))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe("deck", () => {
  const items = ["a", "b", "c", "d", "e"]

  it("repeats exactly for the same seed", async () => {
    const { deck } = await import("../lib/engine/sequence")
    const x = deck(items, 7), y = deck(items, 7)
    expect(Array.from({ length: 12 }, (_, i) => x(i))).toEqual(Array.from({ length: 12 }, (_, i) => y(i)))
  })

  it("uses every item once before any repeats, and keeps going", async () => {
    const { deck } = await import("../lib/engine/sequence")
    const d = deck(items, 3)
    expect(new Set(Array.from({ length: 5 }, (_, i) => d(i))).size).toBe(5)
    expect(new Set(Array.from({ length: 5 }, (_, i) => d(5 + i))).size).toBe(5)
    expect(d(1000)).toBeDefined()
  })

  it("refuses an empty list with a clear error instead of returning nonsense", async () => {
    const { deck } = await import("../lib/engine/sequence")
    expect(() => deck([], 1)(0)).toThrow(/empty/)
  })

  it("does not depend on the order the positions are asked for", async () => {
    const { deck } = await import("../lib/engine/sequence")
    const a = deck(items, 11), b = deck(items, 11)
    const late = a(9)
    expect(b(0) && b(9)).toBe(late)
  })
})
