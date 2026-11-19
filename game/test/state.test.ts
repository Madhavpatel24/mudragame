import { describe, expect, it } from "vitest"
import { decodeChallenge, encodeChallenge, type Challenge } from "../lib/challenge"
import { addPractice, emptyProgress, loadProgress, markLearned, recordBest, recordLevel, saveProgress, type KV } from "../lib/progress"

const memory = (): KV & { data: Record<string, string> } => {
  const data: Record<string, string> = {}
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}

describe("progress", () => {
  it("starts empty and keeps each mode separate", () => {
    const kv = memory()
    saveProgress("samyukta", addPractice(emptyProgress(), "Anjali", 80), kv)
    expect(loadProgress("samyukta", kv).practice.Anjali).toEqual([80])
    expect(loadProgress("asamyukta", kv)).toEqual(emptyProgress())
  })

  it("survives broken or missing storage", () => {
    const bad: KV = { getItem: () => "{not json", setItem: () => { throw new Error("full") } }
    expect(loadProgress("asamyukta", bad)).toEqual(emptyProgress())
    expect(() => saveProgress("asamyukta", emptyProgress(), bad)).not.toThrow()
    expect(loadProgress("asamyukta", null)).toEqual(emptyProgress())
  })

  it("keeps only the latest scores", () => {
    let p = emptyProgress()
    for (let i = 0; i < 30; i++) p = addPractice(p, "Mayura", i)
    expect(p.practice.Mayura).toHaveLength(20)
    expect(p.practice.Mayura!.at(-1)).toBe(29)
  })

  it("marks learned once", () => {
    const p = markLearned(markLearned(emptyProgress(), "Mayura"), "Mayura")
    expect(p.learned).toEqual(["Mayura"])
  })

  it("unlocks the next level only when passed, and keeps the best stars", () => {
    let p = recordLevel(emptyProgress(), 0, 3, true)
    expect(p.ladder).toEqual({ unlocked: 1, stars: { 0: 3 } })
    p = recordLevel(p, 0, 1, true)
    expect(p.ladder.stars[0]).toBe(3)
    p = recordLevel(p, 1, 2, false)
    expect(p.ladder.unlocked).toBe(1)
  })

  it("records a best score only when it is higher", () => {
    const first = recordBest(emptyProgress(), "speed", 12)
    expect(first.isBest).toBe(true)
    const lower = recordBest(first.progress, "speed", 9)
    expect(lower.isBest).toBe(false)
    expect(lower.progress.best.speed).toBe(12)
  })
})

describe("challenge links", () => {
  const c: Challenge = { mode: "samyukta", game: "speed", seed: 123456, score: 14, from: "Asha" }

  it("round-trips", () => {
    expect(decodeChallenge(encodeChallenge(c))).toEqual(c)
  })

  it("is safe to put in a web address", () => {
    expect(encodeChallenge(c)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("handles names with accents", () => {
    expect(decodeChallenge(encodeChallenge({ ...c, from: "Mādhav" }))?.from).toBe("Mādhav")
  })

  it("rejects garbage, wrong modes and wrong types", () => {
    expect(decodeChallenge("")).toBeNull()
    expect(decodeChallenge(null)).toBeNull()
    expect(decodeChallenge("!!!not-base64!!!")).toBeNull()
    expect(decodeChallenge(encodeChallenge({ ...c, mode: "other" as never }))).toBeNull()
    expect(decodeChallenge(encodeChallenge({ ...c, seed: 1.5 }))).toBeNull()
    expect(decodeChallenge(encodeChallenge({ ...c, game: "x" as never }))).toBeNull()
  })

  it("limits the name length and cleans the score", () => {
    const d = decodeChallenge(encodeChallenge({ ...c, from: "x".repeat(100), score: -5 }))
    expect(d?.from).toHaveLength(24)
    expect(d?.score).toBe(0)
  })
})
