import { describe, expect, it, vi } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { BusyError, ModeManager, SamyuktaRecogniser, SamyuktaServerError, createRegistry, type SamyuktaOptions } from "../src"

const BASE = "http://server.test"
const frame = new Blob(["jpeg"])

type Reply = { status?: number; body?: unknown; throws?: boolean; delayMs?: number }

/** A fake fetch that answers from a script, one reply per call. */
function scripted(replies: Reply[]) {
  const calls: { url: string; method: string; hasFile: boolean }[] = []
  let i = 0
  const fn = (async (url: string, init?: RequestInit) => {
    const r = replies[Math.min(i++, replies.length - 1)]!
    calls.push({ url, method: init?.method ?? "GET", hasFile: init?.body instanceof FormData && (init.body as FormData).has("file") })
    if (r.delayMs) {
      await new Promise<void>((res, rej) => {
        const t = setTimeout(res, r.delayMs)
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t)
          rej(new DOMException("aborted", "AbortError"))
        })
      })
    }
    if (r.throws) throw new TypeError("network down")
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body } as Response
  }) as unknown as typeof fetch
  return { fn, calls }
}

const healthy = { body: { ready: true, classes: ["Anjali", "Chakra", "Garuda"] } }
const guess = { body: { top: [{ label: "Chakra", prob: 0.2 }, { label: "Anjali", prob: 0.7 }, { label: "Garuda", prob: 0.1 }], crop: { hands_detected: 2 } } }

const make = (replies: Reply[], extra: Partial<SamyuktaOptions> = {}) => {
  const f = scripted(replies)
  const r = new SamyuktaRecogniser({ baseUrl: BASE, fetch: f.fn, sleep: async () => {}, ...extra })
  return { r, ...f }
}

describe("SamyuktaRecogniser (fake server)", () => {
  it("loads when the server is ready and remembers its classes", async () => {
    const { r, calls } = make([healthy])
    await r.load()
    expect(r.classes).toEqual(["Anjali", "Chakra", "Garuda"])
    expect(calls[0]).toMatchObject({ url: `${BASE}/health`, method: "GET" })
  })

  it("sends the frame as a file to /predict and returns guesses best first", async () => {
    const { r, calls } = make([healthy, guess])
    await r.load()
    const p = await r.predict(frame)
    expect(calls[1]).toMatchObject({ url: `${BASE}/predict`, method: "POST", hasFile: true })
    expect(p.top.map((g) => g.label)).toEqual(["Anjali", "Chakra", "Garuda"])
    expect(p.handsSeen).toBe(2)
  })

  it("reports handsSeen as null when the server does not say", async () => {
    const { r } = make([healthy, { body: { top: [{ label: "Anjali", prob: 0.5 }] } }])
    await r.load()
    expect((await r.predict(frame)).handsSeen).toBeNull()
  })

  it("keeps only topK guesses", async () => {
    const { r } = make([healthy, guess], { topK: 1 })
    await r.load()
    expect((await r.predict(frame)).top).toHaveLength(1)
  })

  it("encodes non-Blob frames before sending", async () => {
    const encode = vi.fn(async () => new Blob(["encoded"]))
    const { r, calls } = make([healthy, guess], { encode })
    await r.load()
    await r.predict({} as HTMLCanvasElement)
    expect(encode).toHaveBeenCalledOnce()
    expect(calls[1]?.hasFile).toBe(true)
  })
})

describe("waking up", () => {
  it("keeps trying while the server is asleep, then loads", async () => {
    const onWaking = vi.fn()
    const { r, calls } = make([{ throws: true }, { throws: true }, { status: 503 }, healthy], { onWaking })
    await r.load()
    expect(calls).toHaveLength(4)
    expect(onWaking).toHaveBeenCalledTimes(3)
  })

  it("waits when the server is up but the model is not loaded yet", async () => {
    const { r, calls } = make([{ body: { ready: false, classes: [] } }, healthy])
    await r.load()
    expect(calls).toHaveLength(2)
  })

  it("gives up with a clear error after the wake timeout", async () => {
    const { r } = make([{ throws: true }], { wakeTimeoutMs: 0 })
    await expect(r.load()).rejects.toThrow(SamyuktaServerError)
    await expect(r.load()).rejects.toThrow(/cannot be reached/)
  })

  it("stops quietly when told to stop while waiting", async () => {
    const controller = new AbortController()
    const { r } = make([{ throws: true }], { sleep: async () => controller.abort() })
    await expect(r.load(controller.signal)).resolves.toBeUndefined()
    await expect(r.predict(frame)).rejects.toThrow(/not loaded/)
  })
})

describe("prediction failures", () => {
  it("refuses to predict before load and after dispose", async () => {
    const { r } = make([healthy, guess])
    await expect(r.predict(frame)).rejects.toThrow(/not loaded/)
    await r.load()
    r.dispose()
    await expect(r.predict(frame)).rejects.toThrow(/not loaded/)
  })

  it("turns a 503 into a clear error", async () => {
    const { r } = make([healthy, { status: 503 }])
    await r.load()
    await expect(r.predict(frame)).rejects.toThrow(/not ready/)
  })

  it("turns a network failure into a clear error", async () => {
    const { r } = make([healthy, { throws: true }])
    await r.load()
    await expect(r.predict(frame)).rejects.toThrow(/cannot be reached/)
  })

  it("times out a slow prediction", async () => {
    const { r } = make([healthy, { delayMs: 500 }], { predictTimeoutMs: 20 })
    await r.load()
    await expect(r.predict(frame)).rejects.toThrow(/timed out/)
  })

  it("skips a frame while one is in flight, then accepts the next", async () => {
    const { r } = make([healthy, { ...guess, delayMs: 50 }, guess])
    await r.load()
    const first = r.predict(frame)
    await expect(r.predict(frame)).rejects.toBeInstanceOf(BusyError)
    await first
    await expect(r.predict(frame)).resolves.toBeDefined()
  })

  it("dispose cancels a prediction in flight", async () => {
    const { r } = make([healthy, { delayMs: 500 }])
    await r.load()
    const pending = r.predict(frame)
    r.dispose()
    await expect(pending).rejects.toThrow(/cancelled|timed out/)
  })

  it("accepts percentages from the server", async () => {
    const { r } = make([healthy, { body: { top: [{ label: "Anjali", prob: 80 }, { label: "Chakra", prob: 20 }] } }])
    await r.load()
    expect((await r.predict(frame)).top[0]?.prob).toBeCloseTo(0.8)
  })
})

describe("through the mode manager", () => {
  it("a server that is down leaves the manager in error, ready to retry", async () => {
    const { fn } = scripted([{ throws: true }])
    const manager = new ModeManager(
      createRegistry([
        { id: "samyukta", label: "Samyukta", handsNeeded: 2, create: () => new SamyuktaRecogniser({ baseUrl: BASE, fetch: fn, sleep: async () => {}, wakeTimeoutMs: 0 }) },
      ])
    )
    await manager.select("samyukta")
    expect(manager.getState()).toMatchObject({ status: "error", mode: "samyukta" })
    expect(manager.getState().error).toBeInstanceOf(SamyuktaServerError)
  })
})

// ---- Against her real server, only when it is running on this machine ------------------------
const LIVE = process.env.SAMYUKTA_URL ?? "http://127.0.0.1:8001"
const live = await fetch(`${LIVE}/health`, { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok)
  .catch(() => false)
const teacher = new URL("../../vendor/samyukta-hasta-game/outputs/teacher/", import.meta.url)

describe.skipIf(!live)("against Aparna's real server", () => {
  const crop = (n: number) => new Blob([readFileSync(new URL(`crops/frame_${String(n).padStart(6, "0")}.jpg`, teacher))], { type: "image/jpeg" })

  it("loads and reports her 21 classes", async () => {
    const r = new SamyuktaRecogniser({ baseUrl: LIVE })
    await r.load()
    expect(r.classes).toHaveLength(21)
    r.dispose()
  })

  it("returns well-formed predictions for real frames", async () => {
    const r = new SamyuktaRecogniser({ baseUrl: LIVE })
    await r.load()
    const frames = [200, 600, 1500, 2500, 3500, 4500, 5000].filter((n) => existsSync(new URL(`crops/frame_${String(n).padStart(6, "0")}.jpg`, teacher)))
    expect(frames.length).toBeGreaterThan(0)
    for (const n of frames) {
      const p = await r.predict(crop(n))
      console.log(`frame ${n}: ${p.top[0]?.label} ${(100 * (p.top[0]?.prob ?? 0)).toFixed(0)}%  hands=${p.handsSeen}`)
      expect(p.top.length).toBeGreaterThan(0)
      expect(r.classes).toContain(p.top[0]!.label)
      expect(p.top[0]!.prob).toBeGreaterThan(0)
      expect(p.top[0]!.prob).toBeLessThanOrEqual(1)
      expect(typeof p.handsSeen).toBe("number")
    }
    r.dispose()
  })

  it("works through the mode manager", async () => {
    const manager = new ModeManager(
      createRegistry([{ id: "samyukta", label: "Samyukta", handsNeeded: 2, create: () => new SamyuktaRecogniser({ baseUrl: LIVE }) }])
    )
    await manager.select("samyukta")
    expect(manager.getState().status).toBe("ready")
    expect((await manager.predict(crop(1500))).top.length).toBeGreaterThan(0)
    await manager.dispose()
  })
})
