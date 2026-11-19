import type { ModeId } from "./content/types"

// What the learner has done, saved on this device. Each mode has its own record.
// Reading and writing never throw: private windows and blocked storage just mean nothing is saved.

export type LadderProgress = { unlocked: number; stars: Record<number, number> }

export type Progress = {
  /** Practice scores per mudra id, oldest first. */
  practice: Record<string, number[]>
  /** Mudras the learner said they have learned. */
  learned: string[]
  ladder: LadderProgress
  /** Best score per game id. */
  best: Record<string, number>
}

export const emptyProgress = (): Progress => ({ practice: {}, learned: [], ladder: { unlocked: 0, stars: {} }, best: {} })

const MAX_SCORES = 20
const keyFor = (mode: ModeId) => `mudra-game:v1:${mode}`

export type KV = Pick<Storage, "getItem" | "setItem">

function store(): KV | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadProgress(mode: ModeId, kv: KV | null = store()): Progress {
  try {
    const raw = kv?.getItem(keyFor(mode))
    if (!raw) return emptyProgress()
    const p = JSON.parse(raw) as Partial<Progress>
    const base = emptyProgress()
    return {
      practice: p.practice ?? base.practice,
      learned: Array.isArray(p.learned) ? p.learned : base.learned,
      ladder: { unlocked: p.ladder?.unlocked ?? 0, stars: p.ladder?.stars ?? {} },
      best: p.best ?? base.best,
    }
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(mode: ModeId, p: Progress, kv: KV | null = store()): void {
  try {
    kv?.setItem(keyFor(mode), JSON.stringify(p))
  } catch {
    // nothing to do: the app works without saving
  }
}

// Pure updates, so they can be tested without a browser.
export function addPractice(p: Progress, id: string, score: number): Progress {
  const list = [...(p.practice[id] ?? []), score].slice(-MAX_SCORES)
  return { ...p, practice: { ...p.practice, [id]: list } }
}

export function markLearned(p: Progress, id: string): Progress {
  return p.learned.includes(id) ? p : { ...p, learned: [...p.learned, id] }
}

export function recordLevel(p: Progress, level: number, stars: number, passed: boolean): Progress {
  const best = Math.max(p.ladder.stars[level] ?? 0, stars)
  return {
    ...p,
    ladder: {
      unlocked: passed ? Math.max(p.ladder.unlocked, level + 1) : p.ladder.unlocked,
      stars: { ...p.ladder.stars, [level]: best },
    },
  }
}

export function recordBest(p: Progress, game: string, score: number): { progress: Progress; isBest: boolean } {
  const isBest = score > (p.best[game] ?? 0)
  return { progress: isBest ? { ...p, best: { ...p.best, [game]: score } } : p, isBest }
}
