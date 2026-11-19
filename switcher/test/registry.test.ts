import { describe, expect, it } from "vitest"
import { MockRecogniser, UnknownModeError, createRegistry } from "../src"

const entry = (id: string) => ({ id, label: id, handsNeeded: 1 as const, create: () => new MockRecogniser(id) })

describe("registry", () => {
  it("lists and looks up modes", () => {
    const r = createRegistry([entry("a"), entry("b")])
    expect(r.list().map((m) => m.id)).toEqual(["a", "b"])
    expect(r.has("a")).toBe(true)
    expect(r.get("b").label).toBe("b")
  })

  it("throws on an unknown id", () => {
    expect(() => createRegistry([entry("a")]).get("z")).toThrow(UnknownModeError)
  })

  it("rejects duplicate ids", () => {
    expect(() => createRegistry([entry("a"), entry("a")])).toThrow(/Duplicate/)
  })
})
