"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BusyError, NotReadyError } from "@switcher"
import type { Reading } from "@/lib/engine/scoring"
import { useMode } from "@/components/mode-provider"

export type Camera = ReturnType<typeof useCamera>
type Listener = (r: Reading, at: number) => void

/**
 * Owns the camera and the recognition loop for a screen. Games listen with `listen`, so one camera
 * stream serves every round. Readings come from whichever mode is active.
 */
export function useCamera() {
  const { manager, info } = useMode()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef(0)
  const listeners = useRef(new Set<Listener>())
  const [status, setStatus] = useState<"off" | "starting" | "on" | "error">("off")
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<Reading | null>(null)

  const emit = useCallback((r: Reading) => {
    const at = performance.now()
    setLast(r)
    // One misbehaving listener must never stop the camera for everything else.
    listeners.current.forEach((l) => {
      try {
        l(r, at)
      } catch (e) {
        console.error("camera listener failed", e)
      }
    })
  }, [])

  const listen = useCallback((fn: Listener) => {
    listeners.current.add(fn)
    return () => void listeners.current.delete(fn)
  }, [])

  // The video element can be replaced when a screen changes. Give the running stream to whichever one is shown.
  const attach = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    const stream = streamRef.current
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream
      void el.play().catch(() => {})
    }
  }, [])

  const stop = useCallback(() => {
    loopRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus("off")
  }, [])
  useEffect(() => stop, [stop])

  const start = useCallback(async () => {
    if (!info) return
    setError(null)
    setStatus("starting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
      streamRef.current = stream
      attach(videoRef.current)
      void videoRef.current?.play().catch(() => {}) // the loop below waits until the picture has a size
      setStatus("on")
      const mine = ++loopRef.current
      while (loopRef.current === mine) {
        const video = videoRef.current
        // For development only: a test can supply the reading instead of the real model.
        const fake = process.env.NODE_ENV !== "production" ? (window as unknown as { __predictOverride?: () => Reading }).__predictOverride : undefined
        if (fake) {
          emit(fake())
        } else if (video && video.videoWidth) {
          try {
            emit(await manager.predict(video))
          } catch (e) {
            if (!(e instanceof BusyError || e instanceof NotReadyError)) setError(e instanceof Error ? e.message : "Recognition failed")
          }
        }
        await new Promise((r) => setTimeout(r, info.sampleIntervalMs))
      }
    } catch {
      setError("The camera couldn't be started. Allow camera access and try again.")
      setStatus("error")
      stop()
    }
  }, [info, manager, emit, stop, attach])

  // For development only: lets a test feed a reading without a camera.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const w = window as unknown as { __inject?: (top: [string, number][], hands?: number) => void }
    w.__inject = (top, hands = 1) => emit({ top: top.map(([label, prob]) => ({ label, prob })), handsSeen: hands })
    return () => void delete w.__inject
  }, [emit])

  return { videoRef, attach, status, error, last, start, stop, listen, emit }
}
