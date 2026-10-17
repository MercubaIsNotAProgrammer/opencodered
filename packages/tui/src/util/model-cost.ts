export * as ModelCost from "./model-cost"

import { createSignal } from "solid-js"
import type { Config } from "../config"

type ModelInfo = {
  id: string
  cost: Array<{
    input: number
    output: number
    cache?: { read: number; write: number }
  }>
}

const free = (value: number | undefined) => !value || value <= 0

function rate(model: ModelInfo) {
  return model.cost.find((cost) => !("tier" in cost)) ?? model.cost[0]
}

/** A model is free when every metered rate is zero. */
export function isFree(model: ModelInfo) {
  const cost = rate(model)
  if (!cost) return true
  return free(cost.input) && free(cost.output) && free(cost.cache?.read) && free(cost.cache?.write)
}

export function isPaid(model: ModelInfo, config: Config.Resolved) {
  return !isFree(model) && config.model_guard.paid_visibility === "warn"
}

/** Whether the model should appear in the dialog at all. */
export function visible(model: ModelInfo, config: Config.Resolved) {
  return isFree(model) || config.model_guard.paid_visibility === "warn"
}

function usd(value: number | undefined) {
  const amount = value ?? 0
  if (amount === 0) return "$0"
  if (amount >= 1) return `$${amount.toFixed(2)}`
  if (amount >= 0.01) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(4)}`
}

/** Compact per-million-token pricing, e.g. `$3.00/M in · $15.00/M out`. */
export function format(model: ModelInfo) {
  const cost = rate(model)
  if (!cost || isFree(model)) return undefined
  const parts = [`${usd(cost.input)}/M in`, `${usd(cost.output)}/M out`]
  if (cost.cache?.read) parts.push(`${usd(cost.cache.read)}/M cache read`)
  if (cost.cache?.write) parts.push(`${usd(cost.cache.write)}/M cache write`)
  return parts.join(" · ")
}

/** The red "Paid" label shown next to a non-free model. */
export function label(model: ModelInfo, config: Config.Resolved) {
  if (!isPaid(model, config)) return undefined
  const cost = format(model)
  return cost ? `PAID ${cost}` : "PAID"
}

/** The extra line shown under an armed paid model awaiting its confirming Enter. */
export function armedLabel() {
  return "ENTER again to confirm paid"
}

/**
 * Two-step switch state. Returns true when the selection should go through; a paid
 * model that is not armed yet arms itself and reports false.
 */
export function createSwitchGuard(config: Config.Resolved, window = 4000) {
  // A signal, not a plain variable: the option footers are a memo and must re-render on arm.
  const [armed, setArmed] = createSignal<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const disarm = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    setArmed(undefined)
  }

  const guard = (key: string, paid: boolean) => {
    if (!paid || !config.model_guard.confirm_paid_switch) {
      disarm()

      return true
    }

    if (armed() === key) {
      disarm()

      return true
    }

    if (timer) clearTimeout(timer)
    setArmed(key)
    timer = setTimeout(disarm, window)

    return false
  }

  return {
    armed,
    guard,
    disarm,
  }
}