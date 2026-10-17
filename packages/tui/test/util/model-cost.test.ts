import { describe, expect, test } from "bun:test"
import { ModelCost } from "../../src/util/model-cost"
import type { Config } from "../../src/config"

const config = (overrides: Partial<Config.Resolved["model_guard"]> = {}) =>
  ({
    model_guard: {
      paid_visibility: "warn",
      confirm_paid_switch: true,
      ...overrides,
    },
  }) as unknown as Config.Resolved

const free = { id: "free-model", cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }] }
const paid = {
  id: "paid-model",
  cost: [{ input: 3, output: 15, cache: { read: 0.3, write: 3.75 } }],
}
const noCost = { id: "local", cost: [] }

describe("isFree", () => {
  test("treats an all-zero rate as free", () => {
    expect(ModelCost.isFree(free)).toBe(true)
  })

  test("treats a missing cost as free", () => {
    expect(ModelCost.isFree(noCost)).toBe(true)
  })

  test("treats any non-zero rate as paid", () => {
    expect(ModelCost.isFree(paid)).toBe(false)
    expect(ModelCost.isFree({ id: "x", cost: [{ input: 0, output: 1, cache: { read: 0, write: 0 } }] })).toBe(false)
    expect(ModelCost.isFree({ id: "x", cost: [{ input: 0, output: 0, cache: { read: 1, write: 0 } }] })).toBe(false)
  })
})

describe("format", () => {
  test("prints per-million-token pricing", () => {
    expect(ModelCost.format(paid)).toBe("$3.00/M in · $15.00/M out · $0.300/M cache read · $3.75/M cache write")
  })

  test("keeps small rates precise", () => {
    expect(ModelCost.format({ id: "x", cost: [{ input: 0.0006, output: 0.0025, cache: { read: 0, write: 0 } }] })).toBe(
      "$0.0006/M in · $0.0025/M out",
    )
  })

  test("returns nothing for free models", () => {
    expect(ModelCost.format(free)).toBeUndefined()
    expect(ModelCost.format(noCost)).toBeUndefined()
  })
})

describe("visibility", () => {
  test("warn keeps paid models listed", () => {
    expect(ModelCost.visible(paid, config())).toBe(true)
    expect(ModelCost.isPaid(paid, config())).toBe(true)
    expect(ModelCost.label(paid, config())).toBe("PAID $3.00/M in · $15.00/M out · $0.300/M cache read · $3.75/M cache write")
  })

  test("hide drops paid models from the list", () => {
    const hidden = config({ paid_visibility: "hide" })
    expect(ModelCost.visible(paid, hidden)).toBe(false)
    expect(ModelCost.visible(free, hidden)).toBe(true)
    expect(ModelCost.label(paid, hidden)).toBeUndefined()
  })
})

describe("createSwitchGuard", () => {
  test("needs two presses for a paid model", () => {
    const guard = ModelCost.createSwitchGuard(config())

    expect(guard.guard("paid", true)).toBe(false)
    expect(guard.armed()).toBe("paid")
    expect(guard.guard("paid", true)).toBe(true)
    expect(guard.armed()).toBeUndefined()
  })

  test("only lets the armed model confirm", () => {
    const guard = ModelCost.createSwitchGuard(config())

    expect(guard.guard("a", true)).toBe(false)
    expect(guard.armed()).toBe("a")

    // Pressing another paid model moves the arm, so a stale arm cannot confirm.
    expect(guard.guard("b", true)).toBe(false)
    expect(guard.armed()).toBe("b")
    expect(guard.guard("a", true)).toBe(false)
    expect(guard.guard("a", true)).toBe(true)
  })

  test("passes free models straight through and disarms", () => {
    const guard = ModelCost.createSwitchGuard(config())

    guard.guard("paid", true)
    expect(guard.guard("free", false)).toBe(true)
    expect(guard.armed()).toBeUndefined()
  })

  test("switches immediately when confirmation is off", () => {
    const guard = ModelCost.createSwitchGuard(config({ confirm_paid_switch: false }))

    expect(guard.guard("paid", true)).toBe(true)
  })

  test("disarms on demand", () => {
    const guard = ModelCost.createSwitchGuard(config())

    guard.guard("paid", true)
    guard.disarm()
    expect(guard.armed()).toBeUndefined()
    expect(guard.guard("paid", true)).toBe(false)
  })

  test("disarms on its own after the window", async () => {
    const guard = ModelCost.createSwitchGuard(config(), 10)

    guard.guard("paid", true)
    expect(guard.armed()).toBe("paid")
    await Bun.sleep(30)
    expect(guard.armed()).toBeUndefined()
  })

  test("arms a label so a memo re-renders while armed", () => {
    const guard = ModelCost.createSwitchGuard(config())
    const seen: Array<string | undefined> = []

    // Reads the signal the way the option footer memo does.
    const read = () => seen.push(guard.armed())

    read()
    guard.guard("paid", true)
    read()
    guard.guard("paid", true)
    read()

    expect(seen).toEqual([undefined, "paid", undefined])
  })
})