# Leyland fork

This repository is a fork of [`anomalyco/opencode`](https://github.com/anomalyco/opencode)
(MIT). `origin` is our fork, `upstream` is the original and is kept **read-only for
manual cherry-picks only**. We do not track upstream automatically.

## Remotes

```
origin    https://github.com/MercubaIsNotAProgrammer/opencodered.git   (ours, push here)
upstream  https://github.com/anomalyco/opencode.git                     (read-only reference)
```

Never `git pull upstream`. Security fixes from upstream are cherry-picked by hand so
our patches are not clobbered.

## Local patches

Tracked in `PATCHES.md`. Summary of what we change and why is there.

## Model cost guard

The feature this fork exists for. Two behaviours, both configurable:

1. **Paid model visibility** — models with a non-zero token price either stay listed
   with a bright red warning label plus their per-million-token price, or are hidden
   entirely.
2. **Two-step paid switch** — selecting a paid model takes two clicks. The first click
   only arms it (red outline, "Click again to confirm"); the second one within 4
   seconds actually switches. Free models still switch in one click.

### Where the logic lives

| Surface | Cost rules | Switch guard |
| --- | --- | --- |
| Desktop / web (`packages/app`) | `src/providers/models/cost.ts` | `createPaidSwitchGuard` in the same file |
| TUI (`packages/tui`) | `src/util/model-cost.ts` | `createSwitchGuard` in the same file |

`isFreeModel` / `isFree` treat a model as free when every metered rate (input, output,
cache read, cache write) is zero. A model that publishes no cost at all — local
runtimes, keyless catalog entries — counts as free, because nothing is billed per token
through OpenCode for it. The old rule only looked at `provider === "opencode"` and
`cost.input`, which marked other providers' free models as paid and ignored output and
cache rates.

### Settings

Desktop / web — Settings → Preferences → **Model costs**:

- **Paid models**: `Warn` (default) or `Hide`.
- **Confirm paid switch**: on by default.

TUI — `~/.config/opencode/cli.json`:

```jsonc
{
  "model_guard": {
    "paid_visibility": "warn",     // "warn" | "hide"
    "confirm_paid_switch": true,
  },
}
```

## Building

Requires bun (`npm i -g bun --allow-scripts=bun`).

```sh
bun install

# Desktop app bundle (the Solid UI in packages/app)
bun --cwd packages/app run build

# CLI + TUI binary for the current platform
bun --cwd packages/cli run script/build.ts

# Desktop installer
bun --cwd packages/desktop run package
```

Typecheck and test the two changed packages:

```sh
bun --cwd packages/app run typecheck
bun --cwd packages/tui  run typecheck
bun --cwd packages/tui  run test test/util/model-cost.test.ts
```

### Known baseline failures on Windows

These fail on a clean checkout of `dev` too, so they are not caused by our patches:

- `packages/app` unit tests: 36 failures from a `solid-js` / bun `jsxDEV` export mismatch.
- `packages/app` typecheck: 2 errors in the generated `src/custom-elements.d.ts` redirect stub.
- `packages/tui` tests: 7 failures in filesystem-watcher and Windows shell suites.

Verify with `git stash` before blaming a change.

## Auto-update

The desktop auto-updater (`@opencodedesktop-updater`) points at upstream releases and
will overwrite a patched install. Disable it before shipping a locally built app, or
publish your own release feed and point the updater at it. This is the most common way
a fork gets silently clobbered.