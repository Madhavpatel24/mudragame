"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react"
import { ModeManager, type ManagerState } from "@switcher"
import { MODE_INFO, registry, wakingStore, type ModeInfo } from "@/lib/modes"

const IDLE: ManagerState = { status: "idle", mode: null, error: null }

type ModeContext = {
  manager: ModeManager
  state: ManagerState
  info: ModeInfo | null
  waking: { attempt: number; elapsedMs: number } | null
}

const Ctx = createContext<ModeContext | null>(null)

// One manager for the whole app, so the chosen mode survives moving between screens.
export function ModeProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ModeManager | null>(null)
  if (!ref.current) ref.current = new ModeManager(registry)
  const manager = ref.current

  const state = useSyncExternalStore(
    (l) => manager.subscribe(l),
    () => manager.getState(),
    () => IDLE
  )
  const waking = useSyncExternalStore(wakingStore.subscribe, wakingStore.get, () => null)

  useEffect(() => {
    manager.onWarning = (msg, cause) => console.warn(msg, cause)
    // handy for checking in the browser console during development
    if (process.env.NODE_ENV !== "production") (window as unknown as { __manager?: ModeManager }).__manager = manager
  }, [manager])

  const value = useMemo<ModeContext>(
    () => ({ manager, state, waking, info: state.mode ? (MODE_INFO[state.mode] ?? null) : null }),
    [manager, state, waking]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMode(): ModeContext {
  const c = useContext(Ctx)
  if (!c) throw new Error("useMode must be used inside ModeProvider")
  return c
}
