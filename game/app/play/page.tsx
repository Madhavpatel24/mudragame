"use client"

import Link from "next/link"
import { ArrowLeft, BookOpen, Camera, Grid2x2, Link2, MessageCircleQuestion, Music, Share2, Timer, TrendingUp, type LucideIcon } from "lucide-react"
import { PHOTO_CREDIT } from "@/lib/content"
import { buildLadder } from "@/lib/engine/ladder"
import { mastery } from "@/lib/engine/mastery"
import { cn } from "@/components/play/ui"
import { usePlay } from "@/components/play/use-play"

type Game = { href: string; title: string; text: string; icon: LucideIcon; camera: boolean; accent?: boolean }

const GAMES: Game[] = [
  { href: "/play/learn", title: "Learn", text: "See the mudra beside your camera, copy it, and watch how close you are.", icon: BookOpen, camera: true, accent: true },
  { href: "/play/ladder", title: "Mudra Ladder", text: "Level by level: learn a few, copy them, then recall them without the photo.", icon: TrendingUp, camera: true },
  { href: "/play/charades", title: "Meaning Charades", text: "You are given a meaning, such as a peacock. Make the mudra.", icon: MessageCircleQuestion, camera: true },
  { href: "/play/match", title: "Memory Match", text: "Match mudra photos to their names and meanings. No camera needed.", icon: Grid2x2, camera: false },
  { href: "/play/tala", title: "Tala Beat", text: "Change mudras on a slow rhythm.", icon: Music, camera: true },
  { href: "/play/chain", title: "Mudra Chain", text: "Repeat a growing sequence from memory.", icon: Link2, camera: true },
  { href: "/play/speed", title: "Speed Round", text: "How many correct mudras can you make in 60 seconds?", icon: Timer, camera: true },
  { href: "/play/challenge", title: "Challenge a Friend", text: "Send a link with your score for them to beat.", icon: Share2, camera: false },
]

export default function Hub() {
  const { info, mudras, progress, ready, router } = usePlay()
  if (!info || !ready) return null

  const ladder = buildLadder(mudras)
  const learned = mudras.filter((m) => mastery(progress.practice[m.id] ?? []).ready).length
  const level = Math.min(progress.ladder.unlocked, ladder.length - 1) + 1
  const fresh = Object.keys(progress.practice).length === 0

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 md:px-6 md:py-14">
      <button type="button" onClick={() => router.push("/")} className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Change mode
      </button>

      <p className="eyebrow mb-2">{info.tagline}</p>
      <h1 className="font-serif text-4xl md:text-6xl">{info.title}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        {fresh ? "Start with Learn. Once the mudras feel familiar, the games are open to you any time." : "Pick up where you left off, or try something different."}
      </p>

      <dl className="mt-8 grid max-w-xl grid-cols-3 gap-4 text-center">
        {[
          [`${learned} / ${mudras.length}`, "mudras learned"],
          [`${level} / ${ladder.length}`, "ladder level"],
          [`${Object.keys(progress.practice).length}`, "mudras practised"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-2xl border border-border bg-card/60 p-4">
            <dt className="sr-only">{l}</dt>
            <dd className="font-serif text-3xl">{v}</dd>
            <p className="mt-1 text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </dl>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {GAMES.map((g) => (
          <li key={g.href}>
            <Link
              href={g.href}
              className={cn(
                "group flex h-full flex-col rounded-3xl border bg-card/70 p-6 transition hover:-translate-y-0.5 hover:border-accent/60",
                g.accent && fresh ? "border-accent/60 shadow-[0_18px_40px_-26px_rgba(74,44,0,0.5)]" : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <g.icon className="h-7 w-7 text-accent" strokeWidth={1.5} aria-hidden />
                {g.camera && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" aria-hidden /> camera
                  </span>
                )}
              </div>
              <h2 className="mt-4 font-serif text-2xl">{g.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{g.text}</p>
              {g.accent && fresh && <p className="mt-4 text-sm font-medium text-accent">Start here</p>}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-right text-xs">
        <a href={PHOTO_CREDIT.href} target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-4 hover:text-accent">
          Photo credits
        </a>
      </p>
    </main>
  )
}
