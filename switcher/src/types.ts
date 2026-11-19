// The one contract every model sits behind. The game never mentions a specific model,
// only this interface, so adding a mode means adding an adapter and a registry entry.

export type ModeId = string

/** What a recogniser accepts for one prediction. Adapters decide which they support. */
export type Frame = Blob | HTMLVideoElement | HTMLCanvasElement | ImageBitmap

export type Guess = { label: string; prob: number }

export type Prediction = {
  /** Best guesses first. */
  top: Guess[]
  /** How many hands the model saw. null when the model cannot say. */
  handsSeen: number | null
  /** Milliseconds since the epoch when the prediction was produced. */
  at: number
}

export interface Recogniser {
  readonly id: ModeId
  /** Get ready: download a model, check a server, and so on. Must stop early if the signal aborts. */
  load(signal?: AbortSignal): Promise<void>
  predict(frame: Frame): Promise<Prediction>
  /** Release everything: memory, timers, network. Safe to call more than once. */
  dispose(): Promise<void> | void
}

export type ModeConfig = {
  id: ModeId
  label: string
  /** Hands the learner must show for this mode. */
  handsNeeded: 1 | 2
  /** Build a fresh recogniser. Called once per selection, never while another one is alive. */
  create: () => Recogniser
}

export type ManagerStatus = "idle" | "loading" | "ready" | "error"

export type ManagerState = {
  status: ManagerStatus
  /** The mode being loaded, or active. null when idle. */
  mode: ModeId | null
  /** Set only when status is "error". */
  error: Error | null
}
