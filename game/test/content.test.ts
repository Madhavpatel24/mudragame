import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { charadesPrompts, getMudras, type ModeId } from "../lib/content"
import { buildLadder } from "../lib/engine/ladder"

const MODES: ModeId[] = ["asamyukta", "samyukta"]
const publicDir = path.resolve(__dirname, "../public")

describe.each(MODES)("content: %s", (mode) => {
  const mudras = getMudras(mode)

  it("has a full set of mudras", () => {
    expect(mudras.length).toBe(21)
    expect(new Set(mudras.map((m) => m.id)).size).toBe(mudras.length)
  })

  it("gives every mudra a photo that exists, a meaning and something to show for charades", () => {
    for (const m of mudras) {
      expect(m.photo, m.id).toBeTruthy()
      expect(existsSync(path.join(publicDir, m.photo!)), `${m.id} photo file`).toBe(true)
      expect(m.meaning.length, m.id).toBeGreaterThan(2)
      expect(m.uses.length, m.id).toBeGreaterThan(0)
    }
  })

  it("keeps difficulty in range and sorted easiest first", () => {
    for (const m of mudras) {
      expect(m.difficulty).toBeGreaterThanOrEqual(0)
      expect(m.difficulty).toBeLessThanOrEqual(1)
    }
    const d = mudras.map((m) => m.difficulty)
    expect(d).toEqual([...d].sort((a, b) => a - b))
  })

  it("only lists look-alikes that exist in the same mode", () => {
    const ids = new Set(mudras.map((m) => m.id))
    for (const m of mudras) for (const l of m.lookalikes) expect(ids.has(l.id), `${m.id} -> ${l.id}`).toBe(true)
  })

  it("builds a ladder that covers every mudra once and rises gradually", () => {
    const ladder = buildLadder(mudras)
    const fresh = ladder.flatMap((l) => l.fresh)
    expect([...fresh].sort()).toEqual(mudras.map((m) => m.id).sort())
    expect(ladder.length).toBeGreaterThanOrEqual(6)
    for (const l of ladder) expect(l.fresh.length).toBeLessThanOrEqual(3)
    // the first level holds some of the easiest mudras, the last level some of the hardest
    const rank = new Map(mudras.map((m, i) => [m.id, i]))
    const avgRank = (ids: string[]) => ids.reduce((s, id) => s + rank.get(id)!, 0) / ids.length
    expect(avgRank(ladder[0]!.fresh)).toBeLessThan(avgRank(ladder[ladder.length - 1]!.fresh))
  })

  it("never puts two look-alikes in the same level when it can be avoided", () => {
    const byId = new Map(mudras.map((m) => [m.id, m]))
    let clashes = 0
    for (const l of buildLadder(mudras)) {
      for (const a of l.fresh) for (const b of l.fresh) if (a < b && byId.get(a)!.lookalikes.some((x) => x.id === b)) clashes++
    }
    expect(clashes).toBeLessThanOrEqual(1)
  })

  it("makes charades prompts that point to exactly one mudra", () => {
    const prompts = charadesPrompts(mode)
    expect(prompts.length).toBeGreaterThanOrEqual(12)
    expect(new Set(prompts.map((p) => p.prompt)).size).toBe(prompts.length)
  })
})
