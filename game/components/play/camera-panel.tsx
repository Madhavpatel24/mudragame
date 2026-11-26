"use client"

import { Camera as CameraIcon, Square } from "lucide-react"
import type { ReactNode } from "react"
import { Button, cn } from "./ui"
import type { Camera } from "./use-camera"

/** The camera picture with its start button and a hint when the hands are not found. */
export function CameraPanel({
  cam,
  handsNeeded,
  overlay,
  className,
  fill = false,
  aside,
}: {
  cam: Camera
  handsNeeded: 1 | 2
  overlay?: ReactNode
  className?: string
  /** On large screens, take all the height of the parent instead of keeping a 4:3 shape. */
  fill?: boolean
  /** Shown beside the start button. */
  aside?: ReactNode
}) {
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
    <div className={cn(fill && "flex flex-col fit:min-h-0", className)}>
      <div className={cn("relative overflow-hidden rounded-3xl border border-border bg-[#1a120a]", fill ? "aspect-[4/3] fit:aspect-auto fit:min-h-0 fit:flex-1" : "aspect-[4/3]")}>
        <video ref={cam.attach} muted playsInline className={cn("h-full w-full -scale-x-100 object-cover", fill && "absolute inset-0", cam.status !== "on" && "invisible")} />
        {cam.status !== "on" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#e8d4b8]">
            {cam.status === "starting" ? "Starting the camera…" : "The camera is off."}
          </div>
        )}
        {overlay && <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">{overlay}</div>}
      </div>
      <div className={cn("flex flex-wrap items-center justify-center gap-3", fill ? "mt-2" : "mt-3")}>
        {cam.status === "on" ? (
          <Button variant="ghost" size={fill ? "sm" : "md"} onClick={cam.stop}>
            <Square className="h-4 w-4" aria-hidden /> Stop camera
          </Button>
        ) : (
          <Button size={fill ? "sm" : "md"} onClick={cam.start} disabled={cam.status === "starting"}>
            <CameraIcon className="h-4 w-4" aria-hidden /> Start camera
          </Button>
        )}
        {aside}
        {hint && <span role="status" className="text-sm text-amber-800">{hint}</span>}
      </div>
      {cam.error && <p role="alert" className="mt-3 text-sm text-rose-800">{cam.error}</p>}
    </div>
  )
}
