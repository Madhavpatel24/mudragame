"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { encodeChallenge, type Challenge } from "@/lib/challenge"
import { Button } from "./ui"

/** Turns a finished game into a link a friend can open to play the same rounds. */
export function ShareChallenge({ challenge }: { challenge: Challenge }) {
  const [name, setName] = useState("")
  const [copied, setCopied] = useState(false)
  const link = () => `${window.location.origin}/challenge?c=${encodeChallenge({ ...challenge, from: name.trim() || undefined })}`

  const copy = async () => {
    const url = link()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt("Copy this link and send it to your friend:", url)
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card/70 p-5">
      <p className="eyebrow mb-2">Challenge a friend</p>
      <p className="text-sm text-muted-foreground">They get the same rounds as you and see how they compare with your score of {challenge.score}.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="challenge-name">Your name (optional)</label>
        <input
          id="challenge-name"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          className="min-w-0 flex-1 rounded-full border border-border bg-background/70 px-4 py-2.5 text-sm outline-none focus:border-accent/60"
        />
        <Button onClick={copy}>
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Link copied" : "Copy link"}
        </Button>
      </div>
    </div>
  )
}
