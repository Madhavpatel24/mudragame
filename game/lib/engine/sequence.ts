import { seeded, shuffle } from "./rng"

/**
 * An endless, repeatable run of items: the same seed always gives the same order, and no item
 * repeats until all have been used once. This is what makes a challenge fair for both players.
 */
export function deck<T>(items: readonly T[], seed: number): (index: number) => T {
  const cycles: T[][] = []
  return (index) => {
    if (items.length === 0) throw new Error("Cannot pick from an empty list")
    const k = Math.floor(index / items.length)
    while (cycles.length <= k) cycles.push(shuffle(items, seeded(seed + cycles.length * 9973)))
    return cycles[k]![index % items.length]!
  }
}
