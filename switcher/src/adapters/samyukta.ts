import type { Frame, Prediction, Recogniser } from "../types"

// Talks to Aparna's model server (vendor/samyukta-hasta-game/game/game_model_server.py) over HTTP.
// That server is used as it is:
//   GET  /health   -> { ready: boolean, classes: string[] }
//   POST /predict  (multipart, field "file" = a JPEG)
//                  -> { top: [{ label, prob }], crop: { hands_detected, ... } }
//
// Only the address is configuration, so moving from her laptop to a hosted server is one value.

export class SamyuktaServerError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "SamyuktaServerError"
  }
}

/** A prediction was requested while the previous one was still running. The game loop should skip the frame. */
export class BusyError extends Error {
  constructor() {
    super("A prediction is already in progress")
    this.name = "BusyError"
  }
}

export type SamyuktaOptions = {
  /** Where her server runs, with no trailing slash. */
  baseUrl: string
  /** How long load() keeps trying while the server wakes up. Free hosts can take a minute or more. */
  wakeTimeoutMs?: number
  /** Pause between health checks while waking. */
  retryDelayMs?: number
  /** Give up on one prediction after this long. */
  predictTimeoutMs?: number
  topK?: number
  /** Called after each failed health check, so the screen can show "waking up". */
  onWaking?: (info: { attempt: number; elapsedMs: number }) => void
  /** Turns a video, canvas or bitmap into a JPEG. Defaults to a canvas in the browser. */
  encode?: (frame: Exclude<Frame, Blob>) => Promise<Blob>
  fetch?: typeof fetch
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      resolve()
    })
  })

const MAX_WIDTH = 640

async function encodeWithCanvas(frame: Exclude<Frame, Blob>): Promise<Blob> {
  if (typeof HTMLCanvasElement !== "undefined" && frame instanceof HTMLCanvasElement) {
    return new Promise((res, rej) => frame.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode frame"))), "image/jpeg", 0.8))
  }
  const w = (frame as HTMLVideoElement).videoWidth || (frame as ImageBitmap).width
  const h = (frame as HTMLVideoElement).videoHeight || (frame as ImageBitmap).height
  if (!w || !h) throw new Error("Frame has no size yet")
  const canvas = document.createElement("canvas")
  canvas.width = Math.min(w, MAX_WIDTH)
  canvas.height = Math.round((canvas.width * h) / w)
  canvas.getContext("2d")!.drawImage(frame as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode frame"))), "image/jpeg", 0.8))
}

export class SamyuktaRecogniser implements Recogniser {
  readonly id = "samyukta"

  private ready = false
  private disposed = false
  private busy = false
  private inFlight: AbortController | null = null
  private readonly doFetch: typeof fetch
  private readonly sleep: NonNullable<SamyuktaOptions["sleep"]>

  constructor(private readonly options: SamyuktaOptions) {
    this.doFetch = options.fetch ?? ((...a) => globalThis.fetch(...a))
    this.sleep = options.sleep ?? defaultSleep
  }

  /** Classes the server reported. Empty until loaded. */
  classes: string[] = []

  async load(signal?: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error("Recogniser was disposed")
    const { baseUrl, wakeTimeoutMs = 90_000, retryDelayMs = 2_000, onWaking } = this.options
    const started = Date.now()
    let attempt = 0
    let lastProblem = "unreachable"

    while (!signal?.aborted && !this.disposed) {
      attempt++
      try {
        const res = await this.doFetch(`${baseUrl}/health`, { signal })
        if (res.ok) {
          const body = (await res.json()) as { ready?: boolean; classes?: string[] }
          if (body.ready) {
            this.classes = body.classes ?? []
            this.ready = true
            return
          }
          lastProblem = "the server is up but its model is not loaded"
        } else {
          lastProblem = `the server answered ${res.status}`
        }
      } catch (e) {
        if (signal?.aborted) return // stopped on purpose, not a failure
        lastProblem = "the server cannot be reached"
      }

      const elapsedMs = Date.now() - started
      if (elapsedMs >= wakeTimeoutMs) {
        throw new SamyuktaServerError(`Samyukta server is not available: ${lastProblem}.`)
      }
      onWaking?.({ attempt, elapsedMs })
      await this.sleep(retryDelayMs, signal)
    }
  }

  async predict(frame: Frame): Promise<Prediction> {
    if (this.disposed || !this.ready) throw new Error("Samyukta recogniser is not loaded")
    if (this.busy) throw new BusyError()
    this.busy = true
    const controller = new AbortController()
    this.inFlight = controller
    const { baseUrl, predictTimeoutMs = 10_000, topK = 5 } = this.options
    const timer = setTimeout(() => controller.abort(), predictTimeoutMs)

    try {
      const blob = frame instanceof Blob ? frame : await (this.options.encode ?? encodeWithCanvas)(frame)
      const form = new FormData()
      form.append("file", blob, "frame.jpg")

      let res: Response
      try {
        res = await this.doFetch(`${baseUrl}/predict`, { method: "POST", body: form, signal: controller.signal })
      } catch {
        throw new SamyuktaServerError(controller.signal.aborted ? "Prediction timed out or was cancelled." : "Samyukta server cannot be reached.")
      }
      if (!res.ok) throw new SamyuktaServerError(res.status === 503 ? "Samyukta model is not ready on the server." : `Samyukta server error ${res.status}.`, res.status)

      const body = (await res.json()) as { top?: { label: string; prob: number }[]; crop?: { hands_detected?: number } }
      const scale = (body.top ?? []).some((g) => g.prob > 1) ? 100 : 1 // tolerate percentages
      const top = (body.top ?? [])
        .map((g) => ({ label: String(g.label), prob: Number(g.prob) / scale }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, topK)
      const hands = body.crop?.hands_detected
      return { top, handsSeen: typeof hands === "number" ? hands : null, at: Date.now() }
    } finally {
      clearTimeout(timer)
      this.inFlight = null
      this.busy = false
    }
  }

  dispose(): void {
    this.disposed = true
    this.ready = false
    this.inFlight?.abort()
    this.inFlight = null
  }
}
