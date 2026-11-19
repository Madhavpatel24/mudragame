"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, Loader2 } from "lucide-react"
import { decodeChallenge, type Challenge } from "@/lib/challenge"
import { MODE_INFO } from "@/lib/modes"
import { Button } from "@/components/play/ui"
import { useMode } from "@/components/mode-provider"

const GAME_NAME = { speed: "Speed Round", chain: "Mudra Chain" } as const
const UNIT = { speed: "mudras in 60 seconds", chain: "mudras in a chain" } as const

// Where a friend's challenge link lands: it loads the right mode, then opens the game with the same rounds.
export default function ChallengeLanding() {
  const router = useRouter()
  const { manager, state, waking } = useMode()
  const [token, setToken] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("c")
    setToken(t)
    setChallenge(decodeChallenge(t))
  }, [])

  if (challenge === undefined) return null

  if (!challenge || !token) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20">
        <h1 className="font-serif text-4xl">This link doesn&apos;t look right</h1>
        <p className="mt-4 text-muted-foreground">It may have been cut short when it was copied. Ask your friend to send it again, or play on your own.</p>
        <Link href="/" className="mt-6 inline-block text-accent underline underline-offset-4">Choose what to practise</Link>
      </main>
    )
  }

  const info = MODE_INFO[challenge.mode]
  const loading = state.status === "loading" && state.mode === challenge.mode
  const failed = state.status === "error" && state.mode === challenge.mode

  const start = async () => {
    await manager.select(challenge.mode)
    if (manager.getState().status === "ready") router.push(`/play/${challenge.game}?c=${token}`)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 md:py-24">
      <p className="eyebrow mb-3">A challenge for you</p>
      <h1 className="font-serif text-4xl leading-tight md:text-5xl">
        {challenge.from ?? "A friend"} scored {challenge.score} {UNIT[challenge.game]}
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {GAME_NAME[challenge.game]} · {info.title} ({info.tagline.toLowerCase()}). You will get exactly the same rounds. Can you beat it?
      </p>

      <div className="mt-8 space-y-4">
        {loading ? (
          <p role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden />
            <span>
              {info.loadingNote}
              {info.runsOn === "server" && waking && waking.elapsedMs > 0 && <span className="mt-1 block text-xs">Waiting for the server: {Math.round(waking.elapsedMs / 1000)}s</span>}
            </span>
          </p>
        ) : (
          <Button onClick={start}>{failed ? "Try again" : "Take the challenge"}</Button>
        )}
        {failed && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The model for this mode isn&apos;t available right now. Try again in a moment.
          </p>
        )}
        <p className="text-sm text-muted-foreground">The game uses your camera. {info.runsOn === "server" && "In this mode the camera pictures are sent to the model server to be recognised."}</p>
      </div>
    </main>
  )
}
