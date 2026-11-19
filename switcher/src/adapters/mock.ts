import type { Frame, ModeId, Prediction, Recogniser } from "../types"

export type MockOptions = {
  /** Milliseconds load() takes. */
  loadMs?: number
  /** Make load() fail with this error. */
  failLoad?: Error
  /** Make dispose() throw. */
  failDispose?: boolean
  labels?: string[]
}

/** A stand-in recogniser for tests and for building screens before the real models are wired in. */
export class MockRecogniser implements Recogniser {
  static live = 0
  static maxLive = 0
  static log: string[] = []

  static reset(): void {
    MockRecogniser.live = 0
    MockRecogniser.maxLive = 0
    MockRecogniser.log = []
  }

  disposed = false
  private counted = false

  constructor(readonly id: ModeId, private readonly opts: MockOptions = {}) {
    // Alive from construction until dispose, so a recogniser that is still loading counts too.
    this.counted = true
    MockRecogniser.live++
    MockRecogniser.maxLive = Math.max(MockRecogniser.maxLive, MockRecogniser.live)
    MockRecogniser.log.push(`create:${id}`)
  }

  load(signal?: AbortSignal): Promise<void> {
    MockRecogniser.log.push(`load:${this.id}`)
    const { loadMs = 0, failLoad } = this.opts
    return new Promise((resolve, reject) => {
      const done = () => (failLoad ? reject(failLoad) : resolve())
      if (signal?.aborted) return resolve() // stopping early is not a failure
      const timer = setTimeout(done, loadMs)
      signal?.addEventListener("abort", () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async predict(_frame: Frame): Promise<Prediction> {
    const label = this.opts.labels?.[0] ?? `${this.id}-mudra`
    return { top: [{ label, prob: 0.9 }], handsSeen: this.id === "samyukta" ? 2 : 1, at: Date.now() }
  }

  dispose(): void {
    MockRecogniser.log.push(`dispose:${this.id}`)
    if (this.counted && !this.disposed) {
      this.disposed = true
      MockRecogniser.live--
    }
    if (this.opts.failDispose) throw new Error("dispose failed")
  }
}
