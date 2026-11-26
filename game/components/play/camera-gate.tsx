"use client"

import type { ReactNode } from "react"
import { CameraPanel } from "./camera-panel"
import type { ModeInfo } from "@/lib/modes"
import type { Camera } from "./use-camera"

/** Games that need the camera show this until it is on. */
export function CameraGate({ cam, info, header, children, intro }: { cam: Camera; info: ModeInfo; header?: ReactNode; children: ReactNode; intro?: ReactNode }) {
  if (cam.status === "on")
    return (
      <>
        {header}
        {children}
      </>
    )
  // all the text sits together on the left, level with the middle of the camera
  return (
    <div className="grid content-center items-center gap-8 md:grid-cols-2 fit:min-h-[calc(100dvh-11rem)]">
      <div>
      {header}
      <div className="space-y-3">
        <p className="eyebrow">Before you start</p>
        <h2 className="font-serif text-3xl">Turn on your camera</h2>
        <p className="text-muted-foreground">
          {info.handsNeeded === 1 ? "Show one hand" : "Show both hands"} to the camera. Use a plain background and good light, and keep your whole hand in view.
          {info.runsOn === "server" && " In this mode the camera pictures are sent to the model server to be recognised."}
        </p>
        {intro}
      </div>
      </div>
      <CameraPanel cam={cam} handsNeeded={info.handsNeeded} />
    </div>
  )
}
