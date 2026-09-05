# Pomium

A Chromium-based desktop browser (built on Electron) where every click
spawns a pair of Pomeranians.

Click anywhere — a page, the tab strip, the address bar — and a pair of
photoreal Poms sweeps across the window behind a fire shockwave. Hold and
drag to stream them continuously. The OS window itself jolts on every
spawn and settles back to rest once the animation ends, and it keeps
jolting for as long as a drag-stream is running.

## Install

Just want to use Pomium? Download it from the [latest release](https://github.com/DigasNikas/pomium/releases) and follow [`docs/install.md`](docs/install.md). Both installers are unsigned, and that guide walks through the warning your OS will show and exactly what to click past it.

The instructions below are for running Pomium from source, which is what you want if you're developing it, not installing it.

## Run

```sh
npm install
npm start
```

## How it works

- `src/main.js` — Electron main process. Opens the browser window and
  handles `pom-shake` IPC messages by moving the OS window (`setBounds`)
  on every spawn, remembering its resting position so it settles back
  correctly rather than drifting.
- `src/renderer/` — the browser chrome: tab strip, address bar, nav
  buttons, a `<webview>` per tab, and the wiring that forwards pointer
  events (from the chrome itself and from pages) into the pom engine and
  the shake IPC.
- `src/webview-preload.js` — injected into every page loaded in a
  `<webview>`; forwards press, move and release events from the page to
  the host chrome, since a webview is a separate frame the host can't see
  into directly.
- `src/pom/` — the animation engine, ported with no browser-specific
  dependencies: `config.js`, `geometry.js`, `sprites.js`, `engine.js`,
  `atlas.js`, `atlas-loader.js`, `loop.js`, `render.js`, `overlay.js`,
  `coords.js`, and `index.js` tying them together. The overlay is a single
  canvas spanning the whole window, painted above the browser chrome, with
  `pointer-events: none` so every click still reaches whatever it landed
  on underneath. The canvas keeps the rotation component of the camera
  shake, since the OS window can't rotate — position goes to the window,
  rotation stays on the canvas.

## Artwork

The Pomeranian and shockwave spritesheets live in `assets/` as 44
committed atlas files (JSON + WebP pairs across desktop and mobile tiers,
only the desktop tier is used) plus the `atlases.json` manifest that names
them. They're vendored from screen.toys, art by shapiro500
(https://www.instagram.com/shapiro500/), and carry no posted licence.
Because they're committed, a fresh clone runs with no fetch step.
`scripts/fetch-assets.sh` isn't needed for that — it exists as the
provenance record for where the files came from, and to re-fetch or
update them from screen.toys if they ever change.

## Tests

```sh
npm test
```

Runs 66 tests via `node --test`, no dependencies beyond Node itself. They
cover the engine's maths (velocity, jitter, depth), sprite lifecycle,
atlas parsing, cache eviction, render-argument construction, and
coordinate translation — everything in `src/pom/` that doesn't need a
real window to exercise.

They do not cover DOM assembly, file I/O for loading atlases off disk, the
IPC plumbing between webview, host chrome, and main process, or the
window-shake handler in `src/main.js`. See `docs/manual-verification.md`
for the checklist that covers those, and for what to expect from each
item — that checklist has not been run against this build; it's a
handover for whoever tests it next.

## Known limitations

- The window does not shake while maximised or fullscreen — `setBounds`
  fights the OS window manager in that state, so shaking is skipped
  outright rather than fighting it.
- While a drag-stream is running, the window shakes continuously, which
  makes drag-to-select on a page impractical for the duration. This is a
  side effect of shaking on every spawn, not a bug.
- Single window, no bookmarks/history/downloads UI.
- No packaging config (electron-builder/forge) — run from source.
