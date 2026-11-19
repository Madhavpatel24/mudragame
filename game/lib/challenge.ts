import type { ModeId } from "./content/types"

// A challenge travels inside the web address, so it needs no accounts and no database.
// The friend plays the same rounds (same seed) and sees how they compare.

export type Challenge = {
  mode: ModeId
  game: "speed" | "chain"
  /** Makes the rounds identical for both players. */
  seed: number
  /** The sender's score. */
  score: number
  /** A name to show, optional. */
  from?: string
}

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const fromBase64Url = (s: string) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeChallenge(c: Challenge): string {
  return toBase64Url(JSON.stringify(c))
}

/** Returns null for anything that is not a valid challenge, so a bad link just opens the normal app. */
export function decodeChallenge(token: string | null | undefined): Challenge | null {
  if (!token) return null
  try {
    const c = JSON.parse(fromBase64Url(token)) as Partial<Challenge>
    const okMode = c.mode === "asamyukta" || c.mode === "samyukta"
    const okGame = c.game === "speed" || c.game === "chain"
    if (!okMode || !okGame) return null
    if (!Number.isInteger(c.seed) || !Number.isFinite(c.score)) return null
    const from = typeof c.from === "string" ? c.from.slice(0, 24) : undefined
    return { mode: c.mode!, game: c.game!, seed: c.seed!, score: Math.max(0, Math.round(c.score!)), from }
  } catch {
    return null
  }
}
