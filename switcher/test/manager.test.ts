import { beforeEach, describe, expect, it } from "vitest"
import { MockRecogniser, ModeManager, NotReadyError, UnknownModeError, createRegistry, type ManagerState, type MockOptions } from "../src"

const frame = new Blob(["x"])

function setup(opts: { asamyukta?: MockOptions; samyukta?: MockOptions } = {}) {
  const registry = createRegistry([
    { id: "asamyukta", label: "Asamyukta", handsNeeded: 1, create: () => new MockRecogniser("asamyukta", opts.asamyukta) },
    { id: "samyukta", label: "Samyukta", handsNeeded: 2, create: () => new MockRecogniser("samyukta", opts.samyukta) },
  ])
  return new ModeManager(registry)
}

beforeEach(() => MockRecogniser.reset())

describe("selecting a mode", () => {
  it("starts idle", () => {
    expect(setup().getState()).toEqual({ status: "idle", mode: null, error: null })
  })

  it("loads the chosen mode and predicts through it", async () => {
    const m = setup()
    await m.select("asamyukta")
    expect(m.getState()).toMatchObject({ status: "ready", mode: "asamyukta" })
    const p = await m.predict(frame)
    expect(p.top[0]?.label).toBe("asamyukta-mudra")
  })

  it("exposes the hands needed for the current mode", async () => {
    const m = setup()
    await m.select("samyukta")
    expect(m.currentMode()?.handsNeeded).toBe(2)
    await m.select("asamyukta")
    expect(m.currentMode()?.handsNeeded).toBe(1)
  })

  it("rejects an unknown mode without changing state", async () => {
    const m = setup()
    await m.select("asamyukta")
    expect(() => m.select("nope")).toThrow(UnknownModeError)
    expect(m.getState()).toMatchObject({ status: "ready", mode: "asamyukta" })
  })

  it("refuses to predict when nothing is ready", async () => {
    const m = setup()
    await expect(m.predict(frame)).rejects.toBeInstanceOf(NotReadyError)
  })
})

describe("switching cleanly", () => {
  it("disposes the old recogniser before creating the next", async () => {
    const m = setup()
    await m.select("asamyukta")
    await m.select("samyukta")
    expect(MockRecogniser.log).toEqual(["create:asamyukta", "load:asamyukta", "dispose:asamyukta", "create:samyukta", "load:samyukta"])
    expect(MockRecogniser.maxLive).toBe(1)
  })

  it("keeps exactly one alive after 20 back-and-forth switches", async () => {
    const m = setup()
    for (let i = 0; i < 20; i++) await m.select(i % 2 ? "samyukta" : "asamyukta")
    expect(MockRecogniser.live).toBe(1)
    expect(MockRecogniser.maxLive).toBe(1)
    expect(m.getState()).toMatchObject({ status: "ready", mode: "samyukta" })
    const creates = MockRecogniser.log.filter((l) => l.startsWith("create")).length
    const disposes = MockRecogniser.log.filter((l) => l.startsWith("dispose")).length
    expect(creates - disposes).toBe(1)
  })

  it("the last choice wins when selections come in quickly", async () => {
    const m = setup({ asamyukta: { loadMs: 30 }, samyukta: { loadMs: 30 } })
    const a = m.select("asamyukta")
    const b = m.select("samyukta")
    const c = m.select("asamyukta")
    await Promise.all([a, b, c])
    expect(m.getState()).toMatchObject({ status: "ready", mode: "asamyukta" })
    expect(MockRecogniser.live).toBe(1)
    expect(MockRecogniser.maxLive).toBe(1)
  })

  it("switching during a load cancels and disposes the first", async () => {
    const m = setup({ asamyukta: { loadMs: 200 } })
    const first = m.select("asamyukta")
    await new Promise((r) => setTimeout(r, 20))
    const second = m.select("samyukta")
    await Promise.all([first, second])
    expect(m.getState()).toMatchObject({ status: "ready", mode: "samyukta" })
    expect(MockRecogniser.log).toContain("dispose:asamyukta")
    expect(MockRecogniser.live).toBe(1)
    expect(MockRecogniser.maxLive).toBe(1)
  })

  it("reports loading with the target mode right away", () => {
    const m = setup({ samyukta: { loadMs: 50 } })
    void m.select("samyukta")
    expect(m.getState()).toMatchObject({ status: "loading", mode: "samyukta" })
  })

  it("does not predict with the old mode while the new one loads", async () => {
    const m = setup({ samyukta: { loadMs: 50 } })
    await m.select("asamyukta")
    const next = m.select("samyukta")
    await expect(m.predict(frame)).rejects.toBeInstanceOf(NotReadyError)
    await next
  })
})

describe("failure handling", () => {
  it("lands in error with nothing alive when a load fails", async () => {
    const m = setup({ samyukta: { failLoad: new Error("server asleep") } })
    await m.select("samyukta")
    expect(m.getState()).toMatchObject({ status: "error", mode: "samyukta" })
    expect(m.getState().error?.message).toBe("server asleep")
    expect(MockRecogniser.live).toBe(0)
    await expect(m.predict(frame)).rejects.toBeInstanceOf(NotReadyError)
  })

  it("the other mode still works after one fails", async () => {
    const m = setup({ samyukta: { failLoad: new Error("down") } })
    await m.select("samyukta")
    await m.select("asamyukta")
    expect(m.getState()).toMatchObject({ status: "ready", mode: "asamyukta" })
    expect(MockRecogniser.live).toBe(1)
  })

  it("retry loads the same mode again", async () => {
    const m = setup({ samyukta: { failLoad: new Error("down") } })
    await m.select("samyukta")
    await m.retry()
    expect(MockRecogniser.log.filter((l) => l === "create:samyukta")).toHaveLength(2)
    expect(MockRecogniser.live).toBe(0)
  })

  it("a dispose that throws does not block the next switch", async () => {
    const m = setup({ asamyukta: { failDispose: true } })
    const warnings: string[] = []
    m.onWarning = (msg) => warnings.push(msg)
    await m.select("asamyukta")
    await m.select("samyukta")
    expect(m.getState()).toMatchObject({ status: "ready", mode: "samyukta" })
    expect(warnings).toHaveLength(1)
    expect(MockRecogniser.live).toBe(1)
  })
})

describe("dispose and notifications", () => {
  it("dispose releases everything and returns to idle", async () => {
    const m = setup()
    await m.select("samyukta")
    await m.dispose()
    expect(m.getState()).toEqual({ status: "idle", mode: null, error: null })
    expect(MockRecogniser.live).toBe(0)
  })

  it("dispose during a load leaves nothing alive", async () => {
    const m = setup({ asamyukta: { loadMs: 100 } })
    const sel = m.select("asamyukta")
    await new Promise((r) => setTimeout(r, 10))
    await m.dispose()
    await sel
    expect(m.getState().status).toBe("idle")
    expect(MockRecogniser.live).toBe(0)
  })

  it("notifies subscribers in order and stops after unsubscribe", async () => {
    const m = setup()
    const seen: string[] = []
    const off = m.subscribe((s: ManagerState) => seen.push(`${s.status}:${s.mode}`))
    await m.select("asamyukta")
    off()
    await m.select("samyukta")
    expect(seen).toEqual(["loading:asamyukta", "ready:asamyukta"])
  })
})
