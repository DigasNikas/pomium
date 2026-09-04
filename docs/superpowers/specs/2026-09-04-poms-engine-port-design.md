# Porting the Poms engine into Pomium — Design

Date: 2026-09-04
Status: Approved for planning

## Goal

Replace Pomium's inline-SVG click effect with the real Poms engine — the one
built for the Pomium Chrome extension, which reproduces
<https://screen.toys/poms/>: photoreal Pomeranian spritesheets, a fixed
30-updates-per-second simulation, depth-scaled motion along a spawn line, and
a fire shockwave.

The engine already exists and is tested. Its modules were written to know
nothing about the DOM, so most of them port across untouched. What is new is
the integration: a different host, a different way clicks arrive, a different
way assets load, and a window that physically shakes.

## Decisions taken during brainstorming

| Question | Decision |
| --- | --- |
| Overlay scope | One window-wide canvas above the entire chrome, not per-tab |
| Triggers | Every click anywhere — page content and browser chrome alike |
| Hold-and-drag | Streams poms everywhere, page and chrome |
| Artwork | The 44 atlas files committed, mirroring the extension |
| Camera shake | The actual OS window moves, not the canvas |
| Shake during drag | Continuous — the window jitters for as long as a drag streams |

### Accepted consequence

While a drag streams, the window moves under a stationary cursor. Drag-to-select
on a page and scrollbar dragging stop working for the duration. This was chosen
deliberately over clamping the shake, and is reversible by suppressing shake
while `held` is true.

## What ports unchanged

These carry across verbatim, along with their tests:

- `config.js` — every tuning constant
- `geometry.js` — spawn line, heading, depth scaling
- `sprites.js` — sprite lifecycle, insertion-order eviction, culling
- `engine.js` — spawning, camera offsets, drag streaming, character roster
- `atlas.js` — atlas parsing, LRU bitmap cache
- `loop.js` — the fixed 30 updates/second accumulator
- `render.js` — Canvas2D drawing, anchored trimmed-frame maths

**61 of the extension's 67 tests come with them and must pass unmodified.** A
failure there means the port broke something, not that the test was wrong.

| Suite | Tests | Ports? |
| --- | --- | --- |
| `geometry` | 5 | yes |
| `sprites` | 8 | yes |
| `engine` | 13 | yes |
| `atlas` | 11 | yes |
| `loop` | 10 | yes |
| `render` | 7 | yes |
| `config` | 1 | yes — the `ATLAS_CACHE_LIMIT` / `ROSTER_SIZE` invariant |
| `assets-manifest` | 2 | yes — `assets/atlases.json` comes across too |
| `overlay` | 4 | yes — `canvasBackingSize` survives the rewrite |
| `manifest` | 6 | **no** — Chrome manifest integrity, meaningless here |

## What is rewritten

**`atlas-loader.js`.** The extension used `fetch` plus
`chrome.runtime.getURL` specifically because a strict page `img-src` CSP can
block an extension-URL image element while a content-script fetch cannot. None
of that applies here: the renderer is our own trusted chrome with Node
integration. It becomes `fs.promises.readFile` to a `Blob` to
`createImageBitmap`, resolved against the app directory.

**`overlay.js`.** The extension's version carried a closed shadow root and nine
`!important` properties to survive hostile page CSS. This canvas lives in our
own chrome, so both defences go. It keeps the device-pixel-ratio backing-store
sizing and the CSS-pixel `width`/`height` contract the renderer depends on.

**The wiring.** The extension's `src/main.js` becomes `src/pom/index.js`,
because `src/main.js` in this repo is already the Electron main process.

## Architecture

```
src/
  main.js              Electron main; gains the shake IPC handler
  webview-preload.js   extended to forward pointerdown/move/up
  renderer/
    index.html         gains the overlay canvas and module entry
    renderer.js        existing chrome; gains pom wiring
    styles.css
  pom/
    config.js  geometry.js  sprites.js  engine.js   ported verbatim
    atlas.js   loop.js      render.js               ported verbatim
    atlas-loader.js    rewritten for the filesystem
    overlay.js         rewritten, simplified
    index.js           listeners, lazy start, idle teardown
assets/
  atlases.json         character keys and tiers
  desktop/  mobile/    44 atlas files
scripts/fetch-assets.sh
test/                  the ported suite
```

`src/pom-bomb.js` and `src/pom-bomb.css` are deleted, along with the per-tab
`.pom-overlay` divs that `renderer.js` currently creates.

## Click plumbing

Two paths feed one engine.

**Chrome clicks** reach the host document directly. `renderer.js` attaches
document-level pointer listeners; their coordinates are already window-space.

**Page clicks** cannot reach the host — a `<webview>` is a separate frame — so
`webview-preload.js` forwards `pointerdown`, `pointermove` and `pointerup` over
`sendToHost`, and `renderer.js` translates them into window space by adding the
originating pane's `getBoundingClientRect()` offset.

That translation is the only genuinely new piece of logic in the port, and it
is a pure function, so it is unit tested:

```
windowPoint(pageX, pageY, paneRect) -> { x, y }
```

Listeners follow the extension's discipline: passive, never calling
`preventDefault` or `stopPropagation`, so every click still reaches whatever it
landed on. The extension's `event.isTrusted` check is dropped — it existed
because a hostile page could dispatch synthetic events at a content script, and
neither the trusted chrome nor an IPC message from our own preload has that
exposure.

## Window shake

`engine.camera` already produces `{ x, y, rotation }` offsets, decaying over 8
updates from `±2px` horizontal and `±10px` vertical.

The renderer sends `x` and `y` to the main process over IPC; main applies them
with `setBounds` against a recorded resting position. Rotation cannot apply to
an OS window, so the `0.5°` stays on the canvas — dropping it would lose that
part of the effect entirely.

The resting position is the subtle part. It is captured when a shake begins and
restored when the shake timer expires. It must be re-read whenever the window
is idle, or moving the window by hand between shakes would teleport it back to
where it was when the last shake started.

`setBounds` runs at up to 30 calls per second during a sustained drag. If that
proves too heavy in practice, the fallback is to send only every second update;
the design does not assume it will be needed.

## Testing

Unit tests use `node:test` with no dependencies, matching the extension.

Ported unchanged: the 61 tests in the table above. New: the page-to-window
coordinate translation, including a pane at a non-zero offset and a click at a
pane's exact origin. Target after the port is 61 ported plus the new
translation tests.

Not unit tested, by the same reasoning as the extension: `overlay.js` DOM
assembly, `atlas-loader.js` file I/O, the IPC plumbing, and the window shake.
Those are verified by hand in the running app — `npm start`, click a page, click
the chrome, hold and drag, switch tabs mid-animation, and confirm the window
moves and returns to rest.

## Out of scope

- Packaging (electron-builder or forge). The README lists it as a known gap and
  it is a separate job.
- Bookmarks, history, downloads UI.
- Any change to tab management beyond removing the per-tab overlay divs.
- The mobile atlas tier. It stays in `assets/` for parity with the extension,
  but a desktop browser window always selects the desktop tier.
