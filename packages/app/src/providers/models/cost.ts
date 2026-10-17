import { createMemo, createSignal, onCleanup } from "solid-js"
import { useSettings } from "@/settings/model"

export type ModelCostLike = {
  provider: { id: string }
  cost?: {
    input: number
    output: number
    cache?: { read?: number; write?: number }
  }
}

const free = (value: number | undefined) => !value || value <= 0

/**
 * A model is free when every metered rate is zero. Providers that publish no cost
 * at all (local runtimes, keyless catalog entries) are treated as free because
 * nothing is billed per token through OpenCode for them.
 */
export function isFreeModel(model: ModelCostLike) {
  const cost = model.cost

  if (!cost) return true

  return free(cost.input) && free(cost.output) && free(cost.cache?.read) && free(cost.cache?.write)
}

export function isPaidModel(model: ModelCostLike) {
  return !isFreeModel(model)
}

function usd(value: number | undefined) {
  const amount = value ?? 0

  if (amount === 0) return "$0"

  if (amount >= 1) return `$${amount.toFixed(2)}`

  if (amount >= 0.01) return `$${amount.toFixed(3)}`

  return `$${amount.toFixed(4)}`
}

/** Compact per-million-token pricing, e.g. `$3.00/M in · $15.00/M out`. */
export function formatModelCost(model: ModelCostLike) {
  const cost = model.cost

  if (!cost) return undefined

  if (isFreeModel(model)) return undefined

  const parts = [`${usd(cost.input)}/M in`, `${usd(cost.output)}/M out`]
  const read = cost.cache?.read

  if (read && read > 0) parts.push(`${usd(read)}/M cache read`)

  const write = cost.cache?.write

  if (write && write > 0) parts.push(`${usd(write)}/M cache write`)

  return parts.join(" · ")
}

export type PaidVisibility = "warn" | "hide"

/**
 * User preference for models that cost money: show them with a red warning and a
 * price, or leave them out of the picker entirely. Paid models always need a
 * second confirming click while `confirmPaidSwitch` is on.
 */
export function useModelCostGuard() {
  const settings = useSettings()
  const paidVisibility = createMemo(() => settings.modelGuard.paidVisibility())
  const confirmPaidSwitch = createMemo(() => settings.modelGuard.confirmPaidSwitch())

  const show = (model: ModelCostLike) => paidVisibility() === "warn" || isFreeModel(model)

  return {
    paidVisibility,
    confirmPaidSwitch,
    isFree: isFreeModel,
    isPaid: isPaidModel,
    cost: formatModelCost,
    /** Whether the model should appear in the picker at all. */
    show,
    /** Whether selecting this model requires a second, confirming click. */
    requiresConfirm: (model: ModelCostLike) => isPaidModel(model) && confirmPaidSwitch(),
  }
}

/**
 * Two-step switch state: the first request for a paid model only arms it, and the
 * second one within `window` milliseconds switches for real. Arms one key at a
 * time so a stale arm can never confirm a different model.
 */
export function createPaidSwitchGuard(options: { confirm: () => boolean; window?: number }) {
  const window = options.window ?? 4000
  const [armed, setArmed] = createSignal<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const clearTimer = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  const disarm = () => {
    clearTimer()
    setArmed(undefined)
  }

  /**
   * Returns true when the caller's selection should go ahead. A paid model that is
   * not armed yet returns false and becomes the armed key instead.
   */
  const guard = (key: string, paid: boolean) => {
    if (!paid || !options.confirm()) {
      disarm()

      return true
    }

    if (armed() === key) {
      disarm()

      return true
    }

    clearTimer()
    setArmed(key)
    timer = setTimeout(disarm, window)

    return false
  }

  onCleanup(disarm)

  return { armed, guard, disarm }
}