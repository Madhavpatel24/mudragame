"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { getMudras, type ModeId } from "@/lib/content"
import { emptyProgress, loadProgress, saveProgress, type Progress } from "@/lib/progress"
import { useMode } from "@/components/mode-provider"

/** The chosen mode, its mudras and the learner's saved progress. Sends the learner back to choose if nothing is loaded. */
export function usePlay() {
  const router = useRouter()
  const { manager, state, info } = useMode()
  const mode = (state.mode as ModeId | null) ?? null
  const [progress, setProgress] = useState<Progress>(emptyProgress)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (state.status === "idle") router.replace("/")
  }, [state.status, router])

  useEffect(() => {
    if (!mode) return
    setProgress(loadProgress(mode))
    setLoaded(true)
  }, [mode])

  const update = useCallback(
    (fn: (p: Progress) => Progress) => {
      if (!mode) return
      setProgress((prev) => {
        const next = fn(prev)
        saveProgress(mode, next)
        return next
      })
    },
    [mode]
  )

  const mudras = useMemo(() => (mode ? getMudras(mode) : []), [mode])
  return { manager, mode, info, mudras, progress, update, ready: state.status === "ready" && loaded, router }
}
