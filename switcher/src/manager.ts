import type { Frame, ManagerState, ModeConfig, ModeId, Prediction, Recogniser } from "./types"
import type { Registry } from "./registry"

export class NotReadyError extends Error {
  constructor() {
    super("No recogniser is ready. Select a mode first.")
    this.name = "NotReadyError"
  }
}

type Listener = (state: ManagerState) => void

const IDLE: ManagerState = { status: "idle", mode: null, error: null }

/**
 * Owns "which mode is active". Nothing else creates, loads or disposes a recogniser.
 *
 * Rules:
 *  - At most one recogniser exists at a time. A switch waits for the previous one to be
 *    disposed (even one that is still loading) before the next is created.
 *  - The latest selection wins. Earlier ones that have not started are skipped; one that is
 *    loading is aborted and disposed.
 *  - A failed load leaves the manager in "error" with nothing alive. Selecting again recovers.
 */
export class ModeManager {
  private state: ManagerState = IDLE
  private listeners = new Set<Listener>()
  private active: Recogniser | null = null
  private ticket = 0
  private abort: AbortController | null = null
  private queue: Promise<void> = Promise.resolve()

  /** Called with problems that cannot be thrown, such as a dispose that fails. */
  onWarning: (message: string, cause: unknown) => void = () => {}

  constructor(private readonly registry: Registry) {}

  getState(): ManagerState {
    return this.state
  }

  /** The config of the mode that is loading or active, if any. */
  currentMode(): ModeConfig | null {
    return this.state.mode ? this.registry.get(this.state.mode) : null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Switch to a mode. Resolves when this selection has settled (ready, error, or superseded). */
  select(id: ModeId): Promise<void> {
    const config = this.registry.get(id) // throws for an unknown id, before anything changes
    const mine = ++this.ticket
    this.abort?.abort()
    this.set({ status: "loading", mode: id, error: null })
    const run = this.queue.then(() => this.run(config, mine))
    this.queue = run.catch(() => {})
    return run
  }

  /** Load the current mode again after an error. */
  retry(): Promise<void> {
    if (!this.state.mode) return Promise.resolve()
    return this.select(this.state.mode)
  }

  /** Predict with the active recogniser. */
  async predict(frame: Frame): Promise<Prediction> {
    if (this.state.status !== "ready" || !this.active) throw new NotReadyError()
    return this.active.predict(frame)
  }

  /** Release everything and go back to idle. */
  dispose(): Promise<void> {
    const mine = ++this.ticket
    this.abort?.abort()
    this.set(IDLE)
    const run = this.queue.then(() => this.release(mine))
    this.queue = run.catch(() => {})
    return run
  }

  private async run(config: ModeConfig, mine: number): Promise<void> {
    await this.releaseActive()
    if (mine !== this.ticket) return // superseded before it started: never create anything

    const recogniser = config.create()
    const controller = new AbortController()
    this.abort = controller
    try {
      await recogniser.load(controller.signal)
    } catch (error) {
      await this.safeDispose(recogniser)
      if (mine !== this.ticket) return
      this.set({ status: "error", mode: config.id, error: error instanceof Error ? error : new Error(String(error)) })
      return
    }

    if (mine !== this.ticket) {
      await this.safeDispose(recogniser) // finished loading after being replaced
      return
    }
    this.active = recogniser
    this.set({ status: "ready", mode: config.id, error: null })
  }

  private async release(mine: number): Promise<void> {
    await this.releaseActive()
    if (mine === this.ticket) this.set(IDLE)
  }

  private async releaseActive(): Promise<void> {
    const old = this.active
    this.active = null
    if (old) await this.safeDispose(old)
  }

  private async safeDispose(r: Recogniser): Promise<void> {
    try {
      await r.dispose()
    } catch (cause) {
      this.onWarning(`dispose failed for "${r.id}"`, cause)
    }
  }

  private set(next: ManagerState): void {
    this.state = next
    for (const l of [...this.listeners]) l(next)
  }
}
