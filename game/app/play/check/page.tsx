"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Camera, ImageUp, Square } from "lucide-react"
import { BusyError, NotReadyError, type Prediction } from "@switcher"
import { useMode } from "@/components/mode-provider"

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

// A bare "mode check" screen: it proves the chosen mode really recognises something.
// The game itself (rounds, scoring) is built on top of this later.
export default function PlayScreen() {
  const router = useRouter()
  const { manager, state, info } = useMode()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef(0)
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [reading, setReading] = useState<{ p: Prediction; ms: number } | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Nothing chosen yet (for example a page refresh): go back to the mode screen.
  useEffect(() => {
    if (state.status === "idle") router.replace("/")
  }, [state.status, router])

  const stopCamera = useCallback(() => {
    loopRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamera("off")
  }, [])
  useEffect(() => stopCamera, [stopCamera])

  const readOnce = useCallback(
    async (frame: Parameters<typeof manager.predict>[0]) => {
      const t0 = performance.now()
      try {
        const p = await manager.predict(frame)
        setReading({ p, ms: Math.round(performance.now() - t0) })
        setNote(null)
      } catch (e) {
        if (e instanceof BusyError || e instanceof NotReadyError) return // skip this frame
        setNote(e instanceof Error ? e.message : "Recognition failed")
      }
    },
    [manager]
  )

  const startCamera = async () => {
    if (!info) return
    setCameraError(null)
    setCamera("starting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      setCamera("on")
      const mine = ++loopRef.current
      while (loopRef.current === mine) {
        if (video.videoWidth) await readOnce(video)
        await new Promise((r) => setTimeout(r, info.sampleIntervalMs))
      }
    } catch {
      setCameraError("The camera couldn't be started. Allow camera access, or try a photo instead.")
      stopCamera()
    }
  }

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    stopCamera()
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
    bitmap.close()
    await readOnce(canvas)
  }

  if (!info) return null
  const top = reading?.p.top.slice(0, 3) ?? []
  const hands = reading?.p.handsSeen ?? null
  const enough = hands !== null && hands >= info.handsNeeded

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 md:px-6 md:py-14">
      <button
        type="button"
        onClick={() => router.push("/play")}
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to games
      </button>

      <p className="eyebrow mb-2">{info.tagline}</p>
      <h1 className="font-serif text-4xl md:text-5xl">{info.title}</h1>
      <p className="mt-3 text-muted-foreground">
        Mode check: show {info.handsNeeded === 1 ? "one hand" : "both hands"} to the camera and see what is recognised.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-5">
        <section className="md:col-span-3">
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-border bg-[#1a120a]">
            <video ref={videoRef} muted playsInline className={cn("h-full w-full -scale-x-100 object-cover", camera !== "on" && "invisible")} />
            {camera !== "on" && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#e8d4b8]">
                {camera === "starting" ? "Starting the camera…" : "The camera is off."}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {camera === "off" ? (
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition hover:bg-accent/90"
              >
                <Camera className="h-4 w-4" aria-hidden /> Start camera
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm transition hover:border-accent/60"
              >
                <Square className="h-4 w-4" aria-hidden /> Stop
              </button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background/60 px-5 py-3 text-sm transition hover:border-accent/60 hover:text-accent">
              <ImageUp className="h-4 w-4" aria-hidden /> Try a photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
          </div>
          {cameraError && <p role="alert" className="mt-4 text-sm text-rose-800">{cameraError}</p>}
        </section>

        <section aria-live="polite" className="rounded-3xl border border-border bg-card/70 p-6 md:col-span-2">
          <p className="eyebrow mb-3">Your reading</p>
          {!reading ? (
            <p className="text-muted-foreground">Nothing yet. Start the camera or try a photo.</p>
          ) : (
            <>
              <p className={cn("mb-4 text-sm", enough ? "text-emerald-800" : "text-amber-800")}>
                {hands === null
                  ? "Hands seen: unknown"
                  : enough
                    ? `${hands} ${hands === 1 ? "hand" : "hands"} seen`
                    : hands === 0
                      ? "No hand found. Show your hand clearly."
                      : `Only ${hands} hand seen. This mode needs ${info.handsNeeded}.`}
              </p>
              {top.length === 0 ? (
                <p className="text-muted-foreground">No mudra recognised.</p>
              ) : (
                <ul className="space-y-3">
                  {top.map((g, i) => (
                    <li key={g.label}>
                      <div className="flex items-baseline justify-between">
                        <span className={cn("font-serif", i === 0 ? "text-2xl" : "text-base text-muted-foreground")}>{g.label}</span>
                        <span className="text-sm text-muted-foreground">{Math.round(g.prob * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(g.prob * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-5 text-xs text-muted-foreground">Last reading took {reading.ms} ms.</p>
            </>
          )}
          {note && <p role="alert" className="mt-3 text-sm text-rose-800">{note}</p>}
        </section>
      </div>
    </main>
  )
}
