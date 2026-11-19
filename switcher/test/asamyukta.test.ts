import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { AsamyuktaRecogniser, ModeManager, createRegistry, type AsamyuktaDeps, type ClassifierLike, type LandmarkerLike } from "../src"
// The real classifier and feature code from the NrityaNetra frontend, untouched.
import { TreeClassifier, type ClassifierMeta } from "../../asamyukta/frontend/lib/mudra/classifier"
import { computeFeatures } from "../../asamyukta/frontend/lib/mudra/features"

const frame = {} as HTMLCanvasElement
const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.5 - i * 0.015, z: 0 }))

function fakes(over: Partial<{ landmarks: any[][]; failClassifier: boolean; failLandmarker: boolean }> = {}) {
  const close = vi.fn()
  const landmarker: LandmarkerLike = { detect: vi.fn(() => ({ landmarks: over.landmarks ?? [hand] })), close }
  const classifier: ClassifierLike = { classes: ["A", "B", "C"], predictProba: vi.fn(() => [0.2, 0.7, 0.1]) }
  const deps: AsamyuktaDeps = {
    createLandmarker: async () => {
      if (over.failLandmarker) throw new Error("no landmarker")
      return { landmarker }
    },
    loadClassifier: async () => {
      if (over.failClassifier) throw new Error("no classifier")
      return classifier
    },
    computeFeatures: vi.fn(() => [0, 1, 2]),
    decodeBlob: async () => ({ close: vi.fn() }) as unknown as ImageBitmap,
  }
  return { deps, landmarker, classifier, close }
}

describe("AsamyuktaRecogniser (with fakes)", () => {
  it("returns guesses best first and reports one hand", async () => {
    const { deps } = fakes()
    const r = new AsamyuktaRecogniser(deps)
    await r.load()
    const p = await r.predict(frame)
    expect(p.top.map((g) => g.label)).toEqual(["B", "A", "C"])
    expect(p.top[0]?.prob).toBeCloseTo(0.7)
    expect(p.handsSeen).toBe(1)
  })

  it("limits the number of guesses to topK", async () => {
    const r = new AsamyuktaRecogniser(fakes().deps, { topK: 2 })
    await r.load()
    expect((await r.predict(frame)).top).toHaveLength(2)
  })

  it("reports no hands, and no guesses, when none is found", async () => {
    const { deps, classifier } = fakes({ landmarks: [] })
    const r = new AsamyuktaRecogniser(deps)
    await r.load()
    const p = await r.predict(frame)
    expect(p).toMatchObject({ top: [], handsSeen: 0 })
    expect(classifier.predictProba).not.toHaveBeenCalled()
  })

  it("accepts a Blob frame and releases the decoded image", async () => {
    const closeBitmap = vi.fn()
    const { deps } = fakes()
    deps.decodeBlob = async () => ({ close: closeBitmap }) as unknown as ImageBitmap
    const r = new AsamyuktaRecogniser(deps)
    await r.load()
    await r.predict(new Blob(["x"]))
    expect(closeBitmap).toHaveBeenCalledOnce()
  })

  it("will not predict before load or after dispose", async () => {
    const r = new AsamyuktaRecogniser(fakes().deps)
    await expect(r.predict(frame)).rejects.toThrow(/not loaded/)
    await r.load()
    r.dispose()
    await expect(r.predict(frame)).rejects.toThrow(/not loaded/)
  })

  it("dispose closes the tracker once, even if called twice", async () => {
    const { deps, close } = fakes()
    const r = new AsamyuktaRecogniser(deps)
    await r.load()
    r.dispose()
    r.dispose()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("does not leak the tracker when the classifier fails to load", async () => {
    const { deps, close } = fakes({ failClassifier: true })
    await expect(new AsamyuktaRecogniser(deps).load()).rejects.toThrow("no classifier")
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("surfaces a tracker failure", async () => {
    const { deps } = fakes({ failLandmarker: true })
    await expect(new AsamyuktaRecogniser(deps).load()).rejects.toThrow("no landmarker")
  })

  it("closes the tracker if it was told to stop while loading", async () => {
    const { deps, close } = fakes()
    const controller = new AbortController()
    const r = new AsamyuktaRecogniser(deps)
    const loading = r.load(controller.signal)
    controller.abort()
    await loading
    expect(close).toHaveBeenCalledTimes(1)
    await expect(r.predict(frame)).rejects.toThrow(/not loaded/)
  })
})

describe("with the real NrityaNetra classifier", () => {
  const dir = new URL("../../asamyukta/frontend/public/model/", import.meta.url)
  const meta = JSON.parse(readFileSync(new URL("mudra_meta.json", dir), "utf8")) as ClassifierMeta
  const bin = readFileSync(new URL("mudra_trees.bin", dir))
  const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)

  const makeDeps = (): AsamyuktaDeps => ({
    createLandmarker: async () => ({ landmarker: { detect: () => ({ landmarks: [hand] }), close() {} } }),
    loadClassifier: async () => new TreeClassifier(meta, buffer),
    computeFeatures,
  })

  it("gives a valid probability for every class", async () => {
    const r = new AsamyuktaRecogniser(makeDeps(), { topK: meta.classes.length })
    await r.load()
    const p = await r.predict(frame)
    expect(p.top).toHaveLength(meta.classes.length)
    expect(p.top.reduce((s, g) => s + g.prob, 0)).toBeCloseTo(1, 6)
    expect(p.top.every((g, i) => i === 0 || g.prob <= (p.top[i - 1]?.prob ?? 1))).toBe(true)
    expect(meta.classes).toContain(p.top[0]?.label)
  })

  it("works through the mode manager", async () => {
    const manager = new ModeManager(
      createRegistry([{ id: "asamyukta", label: "Asamyukta", handsNeeded: 1, create: () => new AsamyuktaRecogniser(makeDeps()) }])
    )
    await manager.select("asamyukta")
    expect(manager.getState().status).toBe("ready")
    expect((await manager.predict(frame)).handsSeen).toBe(1)
    await manager.dispose()
  })
})
