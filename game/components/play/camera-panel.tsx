"use client"

import { Camera as CameraIcon, Square } from "lucide-react"
import type { ReactNode } from "react"
import { Button, cn } from "./ui"
import type { Camera } from "./use-camera"

/** The camera picture with its start button and a hint when the hands are not found. */
export function CameraPanel({ cam, handsNeeded, overlay, className }: { cam: Camera; handsNeeded: 1 | 2; overlay?: ReactNode; className?: string }) {
  const hands = cam.last?.handsSeen ?? null
  const hint =
    cam.status !== "on"
      ? null
      : hands === 0
        ? "No hand found. Show your hand clearly."
        : hands !== null && hands < handsNeeded
          ? "Show both hands together."
          : null

  return (
    <div className={className}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-[#1a120a]">
        <video ref={cam.attach} muted playsInline className={cn("h-full w-full -scale-x-100 object-cover", cam.status !== "on" && "invisible")} />
        {cam.status !== "on" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#e8d4b8]">
            {cam.status === "starting" ? "Starting the camera…" : "The camera is off."}
          </div>
        )}
        {overlay && <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">{overlay}</div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {cam.status === "on" ? (
          <Button variant="ghost" onClick={cam.stop}>
            <Square className="h-4 w-4" aria-hidden /> Stop camera
          </Button>
        ) : (
          <Button onClick={cam.start} disabled={cam.status === "starting"}>
            <CameraIcon className="h-4 w-4" aria-hidden /> Start camera
          </Button>
        )}
        {hint && <span role="status" className="text-sm text-amber-800">{hint}</span>}
      </div>
      {cam.error && <p role="alert" className="mt-3 text-sm text-rose-800">{cam.error}</p>}
    </div>
  )
}
