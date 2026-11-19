import type { ModeConfig, ModeId } from "./types"

export class UnknownModeError extends Error {
  constructor(id: string) {
    super(`Unknown mode "${id}"`)
    this.name = "UnknownModeError"
  }
}

export type Registry = {
  list(): ModeConfig[]
  has(id: ModeId): boolean
  get(id: ModeId): ModeConfig
}

/** A fixed set of modes. Adding a mode is one more entry, nothing else changes. */
export function createRegistry(configs: ModeConfig[]): Registry {
  const byId = new Map<ModeId, ModeConfig>()
  for (const c of configs) {
    if (byId.has(c.id)) throw new Error(`Duplicate mode id "${c.id}"`)
    byId.set(c.id, c)
  }
  return {
    list: () => [...byId.values()],
    has: (id) => byId.has(id),
    get(id) {
      const c = byId.get(id)
      if (!c) throw new UnknownModeError(id)
      return c
    },
  }
}
