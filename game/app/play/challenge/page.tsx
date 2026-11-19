"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { usePlay } from "@/components/play/use-play"

export default function ChallengeHub() {
  const { info, progress, ready, router } = usePlay()
  if (!info || !ready) return null
  const best = progress.best

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <button type="button" onClick={() => router.push("/play")} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>
      <p className="eyebrow mb-2">{info.title} · Challenge a Friend</p>
      <h1 className="font-serif text-4xl md:text-5xl">Send a challenge</h1>

      <ol className="mt-8 space-y-6 text-muted-foreground">
        <li>
          <strong className="text-foreground">1. Play a Speed Round or a Mudra Chain.</strong> Both give you and your friend the same rounds.
        </li>
        <li>
          <strong className="text-foreground">2. Copy your challenge link</strong> from the results screen. It carries your score in the web address, so there is nothing to sign up for.
        </li>
        <li>
          <strong className="text-foreground">3. Send it.</strong> Your friend opens it, plays the same rounds, and sees whether they beat you.
        </li>
      </ol>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/play/speed" className="rounded-3xl border border-border bg-card/70 p-6 transition hover:border-accent/60">
          <h2 className="font-serif text-2xl">Speed Round</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your best: {best.speed ?? "not played yet"}</p>
        </Link>
        <Link href="/play/chain" className="rounded-3xl border border-border bg-card/70 p-6 transition hover:border-accent/60">
          <h2 className="font-serif text-2xl">Mudra Chain</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your best: {best.chain ?? "not played yet"}</p>
        </Link>
      </div>
    </main>
  )
}
