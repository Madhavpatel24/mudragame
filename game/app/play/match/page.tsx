"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { shuffle, seeded } from "@/lib/engine/rng"
import { recordBest } from "@/lib/progress"
import { Button, MudraPhoto, Stars, cn } from "@/components/play/ui"
import { usePlay } from "@/components/play/use-play"
import type { Mudra } from "@/lib/content"

const SIZES = [3, 4, 6, 8]
type Kind = "name" | "meaning"
type Card = { id: string; mudra: Mudra; side: "photo" | "label"; key: string }

export default function Match() {
  const { mode, mudras, progress, update, ready, router } = usePlay()
  const [level, setLevel] = useState(0)
  const [kind, setKind] = useState<Kind>("name")
  const [round, setRound] = useState(0)
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [moves, setMoves] = useState(0)
  const [newBest, setNewBest] = useState(false)
  const lock = useRef(false)

  const pairs = Math.min(SIZES[level]!, mudras.length)

  const cards = useMemo<Card[]>(() => {
    if (!mode) return []
    const rand = seeded(round * 7919 + level * 131 + (kind === "name" ? 1 : 2))
    const chosen = shuffle(mudras, rand).slice(0, pairs)
    return shuffle(
      chosen.flatMap((m) => [
        { id: m.id, mudra: m, side: "photo" as const, key: `${m.id}-p` },
        { id: m.id, mudra: m, side: "label" as const, key: `${m.id}-l` },
      ]),
      rand
    )
  }, [mode, mudras, pairs, round, level, kind])

  const done = cards.length > 0 && matched.size === pairs
  const score = Math.max(10, Math.min(100, 100 - 6 * (moves - pairs)))
  const stars = (score >= 85 ? 3 : score >= 60 ? 2 : 1) as 1 | 2 | 3

  useEffect(() => {
    if (!done) return
    setNewBest(score > (progress.best[`match-${pairs}-${kind}`] ?? 0))
    update((p) => recordBest(p, `match-${pairs}-${kind}`, score).progress)
    // runs once when the board is cleared
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const restart = (nextLevel = level, nextKind = kind) => {
    setLevel(nextLevel)
    setKind(nextKind)
    setRound((r) => r + 1)
    setFlipped([])
    setMatched(new Set())
    setMoves(0)
    setNewBest(false)
    lock.current = false
  }

  const flip = (idx: number) => {
    if (lock.current || flipped.includes(idx) || matched.has(cards[idx]!.id)) return
    const now = [...flipped, idx]
    setFlipped(now)
    if (now.length < 2) return
    setMoves((m) => m + 1)
    const [a, b] = [cards[now[0]!]!, cards[now[1]!]!]
    if (a.id === b.id && a.side !== b.side) {
      setMatched((s) => new Set(s).add(a.id))
      setFlipped([])
    } else {
      lock.current = true
      setTimeout(() => {
        setFlipped([])
        lock.current = false
      }, 900)
    }
  }

  if (!ready || cards.length === 0) return null
  const cols = pairs <= 3 ? "grid-cols-3" : pairs <= 4 ? "grid-cols-4" : "grid-cols-4 md:grid-cols-6"

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <button type="button" onClick={() => router.push("/play")} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>
      <p className="eyebrow mb-2">Memory Match</p>
      <h1 className="font-serif text-4xl md:text-5xl">Match the pairs</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Turn two cards at a time. Match each photo with its {kind === "name" ? "name" : "meaning"}. No camera needed.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-2" role="group" aria-label="Match with">
          {(["name", "meaning"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => restart(level, k)}
              className={cn("rounded-full border px-4 py-1.5 text-sm transition", kind === k ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background/60 hover:border-accent/50")}>
              Photo and {k}
            </button>
          ))}
        </div>
        <div className="flex gap-2" role="group" aria-label="Size">
          {SIZES.map((n, i) => (
            <button key={n} type="button" aria-pressed={level === i} onClick={() => restart(i, kind)}
              className={cn("rounded-full border px-3 py-1.5 text-sm transition", level === i ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background/60 hover:border-accent/50")}>
              {n} pairs
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">{moves} moves · {matched.size} of {pairs} matched</span>
      </div>

      <ul className={cn("mt-6 grid gap-3", cols)}>
        {cards.map((c, idx) => {
          const open = flipped.includes(idx) || matched.has(c.id)
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => flip(idx)}
                disabled={open}
                aria-label={open ? (c.side === "photo" ? `Photo of ${c.mudra.name}` : kind === "name" ? c.mudra.name : c.mudra.meaning) : `Card ${idx + 1}, face down`}
                className={cn(
                  "grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border p-2 text-center transition",
                  open ? "border-accent/60 bg-card" : "border-border bg-muted hover:border-accent/50",
                  matched.has(c.id) && "border-emerald-600/60"
                )}
              >
                {!open ? (
                  <span className="font-serif text-3xl text-accent/70" aria-hidden>ॐ</span>
                ) : c.side === "photo" ? (
                  <MudraPhoto mudra={c.mudra} className="h-full w-full border-0" />
                ) : (
                  <span className={cn("font-serif leading-tight", kind === "name" ? "text-xl md:text-2xl" : "text-sm md:text-base")}>
                    {kind === "name" ? c.mudra.name : c.mudra.meaning}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {done && (
        <section className="mt-8 rounded-3xl border border-border bg-card/70 p-6" aria-live="polite">
          <p className="eyebrow mb-2">Cleared</p>
          <p className="flex items-center gap-3 font-serif text-3xl">Score {score} <Stars n={stars} /></p>
          <p className="mt-1 text-muted-foreground">{moves} moves for {pairs} pairs. {newBest && <strong className="text-accent">A new best!</strong>}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => restart(level, kind)}>Play again</Button>
            {level < SIZES.length - 1 && mudras.length > pairs && <Button variant="ghost" onClick={() => restart(level + 1, kind)}>Bigger board</Button>}
          </div>
        </section>
      )}
    </main>
  )
}
