import { AsamyuktaRecogniser, SamyuktaRecogniser, createRegistry, type ModeConfig, type ModeId } from "@switcher"
import { createHandLandmarker } from "@asamyukta/mudra/hand-landmarker"
import { loadClassifier } from "@asamyukta/mudra/classifier"
import { computeFeatures } from "@asamyukta/mudra/features"
import type { HoldRules } from "./engine/hold"

// Where Aparna's model server runs. Change this one value when it is hosted.
export const SAMYUKTA_URL = process.env.NEXT_PUBLIC_SAMYUKTA_URL ?? "http://localhost:8001"

/** What the screens say about each mode. The switcher itself knows none of this. */
export type ModeInfo = {
  id: ModeId
  title: string
  tagline: string
  description: string
  handsNeeded: 1 | 2
  mudraCount: number
  runsOn: "device" | "server"
  /** How often a camera frame is sent for recognition. */
  sampleIntervalMs: number
  /** How long a pose must be held to count, tuned to how fast this mode gives readings. */
  hold: HoldRules
  loadingNote: string
}

export const MODE_INFO: Record<ModeId, ModeInfo> = {
  asamyukta: {
    id: "asamyukta",
    title: "Asamyukta",
    tagline: "Single-hand mudras",
    description: "Practise the mudras made with one hand, such as Pataka, Mayura and Trishula.",
    handsNeeded: 1,
    mudraCount: 21,
    runsOn: "device",
    sampleIntervalMs: 150,
    hold: { holdMs: 1000, minReadings: 4, graceMs: 450 },
    loadingNote: "Loading the model. The first time this downloads about 10 MB, and it runs on your device.",
  },
  samyukta: {
    id: "samyukta",
    title: "Samyukta",
    tagline: "Two-hand mudras",
    description: "Practise the mudras made with both hands together, such as Anjali, Garuda and Shankha.",
    handsNeeded: 2,
    mudraCount: 21,
    runsOn: "server",
    sampleIntervalMs: 600,
    hold: { holdMs: 1500, minReadings: 2, graceMs: 1400 },
    loadingNote: "Connecting to the model server. If it was asleep this can take up to a minute.",
  },
}

// Progress of a sleeping server, so the loading screen can show it.
type Waking = { attempt: number; elapsedMs: number } | null
let waking: Waking = null
const wakingListeners = new Set<() => void>()
const setWaking = (w: Waking) => {
  waking = w
  wakingListeners.forEach((l) => l())
}
export const wakingStore = {
  get: () => waking,
  subscribe(l: () => void) {
    wakingListeners.add(l)
    return () => wakingListeners.delete(l)
  },
}

const modes: ModeConfig[] = [
  {
    id: "asamyukta",
    label: "Asamyukta",
    handsNeeded: 1,
    create: () =>
      new AsamyuktaRecogniser({
        createLandmarker: () => createHandLandmarker("IMAGE"),
        loadClassifier: () => loadClassifier("/model/mudra_meta.json", "/model/mudra_trees.bin"),
        computeFeatures,
      }),
  },
  {
    id: "samyukta",
    label: "Samyukta",
    handsNeeded: 2,
    create: () => {
      setWaking(null)
      return new SamyuktaRecogniser({ baseUrl: SAMYUKTA_URL, onWaking: setWaking })
    },
  },
]

export const registry = createRegistry(modes)
