// How well someone is learning a mudra, from their recent practice scores.
export const READY_SCORE = 70
export const RECENT = 5

export type Mastery = { level: 0 | 1 | 2 | 3; percent: number; ready: boolean; attempts: number; best: number }

/** `scores` are attempt scores, oldest first. Ready means the best three recent attempts average 70 or more. */
export function mastery(scores: number[]): Mastery {
  const attempts = scores.length
  if (attempts === 0) return { level: 0, percent: 0, ready: false, attempts: 0, best: 0 }
  const recent = scores.slice(-RECENT)
  const top = [...recent].sort((a, b) => b - a).slice(0, 3)
  const avg = top.reduce((s, x) => s + x, 0) / top.length
  const enough = recent.length >= 2
  const ready = enough && avg >= READY_SCORE
  const level = !enough ? 0 : avg >= 85 ? 3 : avg >= READY_SCORE ? 2 : avg >= 40 ? 1 : 0
  // The bar is full only when the mudra is ready; one lucky try never fills it.
  const raw = Math.min(100, (avg / READY_SCORE) * 100) * (enough ? 1 : 0.5)
  const percent = ready ? 100 : Math.min(99, Math.round(raw))
  return { level: level as 0 | 1 | 2 | 3, percent, ready, attempts, best: Math.max(...scores) }
}
