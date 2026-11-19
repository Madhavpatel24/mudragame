import type { Frame, Prediction, Recogniser } from "../types"

// Wraps the NrityaNetra on-device model (hand tracker -> 93 features -> tree classifier).
//
// The three pieces come in as dependencies instead of being imported, so the code in
// asamyukta/ stays untouched and this adapter can be tested with fakes. The app wires in the
// real ones: createHandLandmarker, loadClassifier and computeFeatures from
// asamyukta/frontend/lib/mudra.
//
// Smoothing over time is left to the game layer, because both modes need it. This adapter
// returns one raw prediction per frame.

type LandmarkPoint = { x: number; y: number; z: number }

/** The part of MediaPipe's HandLandmarker that is used. */
export interface LandmarkerLike {
  detect(image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): { landmarks: LandmarkPoint[][] }
  close(): void
}

/** The part of TreeClassifier that is used. */
export interface ClassifierLike {
  readonly classes: string[]
  predictProba(features: ArrayLike<number>): ArrayLike<number>
}

export type AsamyuktaDeps = {
  createLandmarker(): Promise<{ landmarker: LandmarkerLike }>
  loadClassifier(): Promise<ClassifierLike>
  computeFeatures(landmarks: LandmarkPoint[]): ArrayLike<number>
  /** Turns a Blob into something the tracker can read. Defaults to createImageBitmap. */
  decodeBlob?(blob: Blob): Promise<ImageBitmap>
}

export type AsamyuktaOptions = {
  /** How many guesses to return, best first. */
  topK?: number
}

export class AsamyuktaRecogniser implements Recogniser {
  readonly id = "asamyukta"

  private landmarker: LandmarkerLike | null = null
  private classifier: ClassifierLike | null = null
  private disposed = false

  constructor(
    private readonly deps: AsamyuktaDeps,
    private readonly options: AsamyuktaOptions = {}
  ) {}

  async load(signal?: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error("Recogniser was disposed")
    if (signal?.aborted) return

    // Start both together. If one fails, make sure the other does not leak.
    const [lm, clf] = await Promise.allSettled([this.deps.createLandmarker(), this.deps.loadClassifier()])

    const landmarker = lm.status === "fulfilled" ? lm.value.landmarker : null
    const classifier = clf.status === "fulfilled" ? clf.value : null

    if (lm.status === "rejected" || clf.status === "rejected") {
      landmarker?.close()
      throw lm.status === "rejected" ? lm.reason : (clf as PromiseRejectedResult).reason
    }
    if (signal?.aborted || this.disposed) {
      landmarker?.close() // replaced while loading: the manager will dispose this recogniser
      return
    }
    this.landmarker = landmarker
    this.classifier = classifier
  }

  async predict(frame: Frame): Promise<Prediction> {
    const { landmarker, classifier } = this
    if (this.disposed || !landmarker || !classifier) throw new Error("Asamyukta recogniser is not loaded")

    let image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap
    let bitmap: ImageBitmap | null = null
    if (frame instanceof Blob) {
      bitmap = await (this.deps.decodeBlob ?? ((b) => createImageBitmap(b)))(frame)
      image = bitmap
    } else {
      image = frame
    }

    try {
      const detected = landmarker.detect(image)
      const hand = detected.landmarks[0]
      if (!hand) return { top: [], handsSeen: 0, at: Date.now() }

      const probs = classifier.predictProba(this.deps.computeFeatures(hand))
      const top = classifier.classes
        .map((label, i) => ({ label, prob: probs[i] ?? 0 }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, this.options.topK ?? 5)
      return { top, handsSeen: detected.landmarks.length, at: Date.now() }
    } finally {
      bitmap?.close()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.landmarker?.close()
    this.landmarker = null
    this.classifier = null
  }
}
