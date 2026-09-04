# Poms Engine Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pomium's inline-SVG click effect with the real Poms engine from the Pomium Chrome extension — photoreal spritesheets, fixed 30 updates/second simulation, depth-scaled motion, fire shockwave — rendered on one window-wide canvas, with the OS window itself shaking on every spawn.

**Architecture:** The engine modules were written to know nothing about the DOM, so seven of them port across byte-for-byte along with 61 of the extension's 67 tests. What is new is the host integration: one canvas above the whole browser chrome instead of a per-page overlay, clicks arriving from two sources (the host document directly, and `<webview>` pages over IPC), assets read from disk instead of fetched through a CSP, and camera shake applied to the Electron window via `setBounds` instead of to the canvas.

**Tech Stack:** Electron 31, vanilla ES modules, Canvas2D, `node:test` (no dependencies).

**Spec:** `docs/superpowers/specs/2026-09-04-poms-engine-port-design.md`

## Global Constraints

- **No new dependencies.** Not at runtime, not for tests. `node:test` and `node:assert/strict` only. `electron` stays the sole `devDependency`.
- **The repo root stays CommonJS.** `src/main.js` and `src/renderer/renderer.js` use `require` and must keep working. ESM is scoped by nested `package.json` files containing `{"type":"module"}` in `src/pom/` and `test/` — **verified working before this plan was written**: a root without `"type"` keeps `require` functional while those two directories resolve as ESM. Do not add `"type": "module"` to the root `package.json`.
- **The extension is the source of truth for ported files**, pinned at commit `7e0a0698f64fa4d54e0b3dbac0b26a715b68cb29` in `/Users/diogolimanicolau/pomium-extension`. Copy with `git show`, never by retyping. If that repo is missing, `git clone https://github.com/DigasNikas/pomium-extension` and check out that SHA.
- **Ported tests must pass unmodified.** If a ported test fails, the port is wrong — do not edit the test to make it green.
- **Listeners are passive and never call `preventDefault` or `stopPropagation`**, so every click still reaches whatever it landed on.
- **Commit messages are bare subject lines plus body.** No `Co-Authored-By`, no AI attribution trailer of any kind. Verify with `git log -1 --format=%B` before reporting.
- **Float comparisons in tests use a tolerance** via the `close(actual, expected, eps = 1e-9)` helper, never `assert.equal` on a computed float.

### Constants that must not drift (from `src/pom/config.js`)

```
MOVE_ANGLE_DEG 50      SPREAD_STRENGTH -40    BASE_SPEED 4
MAX_SPEED_FACTOR 3.0   SPAWN_RANDOMNESS 1.0   SHOCKWAVE_SPEED_MULT 0.3
SHAKE_DURATION 8       SHAKE_MAX_X 2          SHAKE_MAX_Y 10
SHAKE_MAX_ROT_DEG 0.5  MIN_SCALE 0.5          MAX_SCALE 2.0
CULL_MARGIN 800        CHARACTER_COUNT 10     UPDATES_PER_SECOND 30
SPAWN_LINE_START {x:0.05, y:0.2}   SPAWN_LINE_END {x:0.7, y:0.0}
POM_ANCHOR {x:0.5, y:0.7}          SHOCKWAVE_ANCHOR {x:0.45, y:0.25}
ATLAS_CACHE_LIMIT = ROSTER_SIZE + 1 (derived — do not hardcode 4)
```

### The shake split (easy to get wrong)

`engine.camera` yields `{ x, y, rotation }`. The **window** takes `x` and `y`; the **canvas** takes `rotation` only. If both took `x`/`y` the shake would double. So `renderScene` is called with `{ x: 0, y: 0, rotation: engine.camera.rotation }`, and `engine.camera.x`/`.y` go to the main process.

---

### Task 1: ESM scoping, test harness, and the pure engine modules

**Files:**
- Modify: `package.json` (add a `test` script)
- Create: `src/pom/package.json`, `test/package.json`
- Create: `src/pom/{config,geometry,sprites,engine,atlas,loop,render}.js` (copied)
- Create: `test/{config,geometry,sprites,engine,atlas,loop,render}.test.js` (copied)
- Create: `test/helpers.js`, `test/fixtures/{char_01_slice.json,shockwave_slice.json}` (copied)

**Interfaces:**
- Consumes: nothing.
- Produces (all from the extension, unchanged):
  - `config.js` — every constant above as a named export
  - `geometry.js` — `jitterT(t, random?)`, `spawnPoint(t, width, height) -> {x,y}`, `headingRadians(t)`, `velocity(t, speed) -> {vx,vy}`, `depthFactor(y, height)`, `scaleForDepth(d)`, `speedMultForDepth(d)`
  - `sprites.js` — `createSprite({key,isShockwave,x,y,vx,vy,frameCount})`, `integrate(sprite, height)`, `advanceFrame(sprite)`, `isCulled(sprite, width, height)`, `class SpriteList`
  - `engine.js` — `createRoster(random?, size?, total?)`, `defaultPickCharacter(roster, random?)`, `createEngine({width, height, random?, roster?, pickCharacter?, frameCountFor}) -> {spawnPair, update, resize, pointerDown, pointerMove, pointerUp, sprites, camera, isIdle}`
  - `atlas.js` — `parseAtlas(json) -> {image, frames}`, `createAtlasCache({limit, load}) -> {get, peek, clear}`
  - `loop.js` — `createLoop({update, render, step?, now?, schedule?, cancel?}) -> {start, stop, running}`
  - `render.js` — `spriteDrawArgs(sprite, frame)`, `renderScene(ctx, {sprites, camera, atlases, width, height})`
  - `test/helpers.js` — `close(actual, expected, eps = 1e-9)`

- [ ] **Step 1: Create the ESM scoping and test script**

`src/pom/package.json` and `test/package.json` both contain exactly:

```json
{ "type": "module" }
```

Add to the root `package.json` `scripts` block, leaving `start` untouched and adding **no** `"type"` key:

```json
"test": "node --test \"test/**/*.test.js\""
```

- [ ] **Step 2: Copy the modules and tests from the extension**

```bash
EXT=/Users/diogolimanicolau/pomium-extension
SHA=7e0a0698f64fa4d54e0b3dbac0b26a715b68cb29
mkdir -p src/pom test/fixtures
for f in config geometry sprites engine atlas loop render; do
  git -C "$EXT" show "$SHA:src/$f.js" > "src/pom/$f.js"
done
for f in config geometry sprites engine atlas loop render; do
  git -C "$EXT" show "$SHA:test/$f.test.js" > "test/$f.test.js"
done
git -C "$EXT" show "$SHA:test/helpers.js" > test/helpers.js
git -C "$EXT" show "$SHA:test/fixtures/char_01_slice.json" > test/fixtures/char_01_slice.json
git -C "$EXT" show "$SHA:test/fixtures/shockwave_slice.json" > test/fixtures/shockwave_slice.json
```

Then fix the import paths: the extension's tests import `../src/x.js`, but here the modules live in `src/pom/`.

```bash
sed -i '' "s|from '../src/|from '../src/pom/|g" test/*.test.js
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: **55 tests, 55 pass, 0 fail** (config 1, geometry 5, sprites 8, engine 13, atlas 11, loop 10, render 7).

If any fail, the copy or the path rewrite is wrong. Do not edit the tests.

- [ ] **Step 4: Confirm the root is still CommonJS**

Run: `node -e "require('./package.json'); console.log('cjs ok')"`
Expected: `cjs ok`

This proves the nested `package.json` files scoped ESM without breaking Electron's entry point.

- [ ] **Step 5: Commit**

```bash
git add package.json src/pom test
git commit -m "feat: port the Poms engine modules and their tests

Seven modules come across byte-for-byte from the extension at 7e0a069:
config, geometry, sprites, engine, atlas, loop and render. They were
written to know nothing about the DOM, so the port is a copy plus an
import-path rewrite, and all 55 of their tests pass unmodified.

ESM is scoped with nested package.json files in src/pom/ and test/ so the
repo root stays CommonJS and Electron's main.js and renderer.js keep using
require."
```

---

### Task 2: Assets and the vendoring script

**Files:**
- Create: `assets/atlases.json`, `scripts/fetch-assets.sh` (copied)
- Create: `test/assets-manifest.test.js` (copied)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `CHARACTER_COUNT` (10) from `src/pom/config.js`.
- Produces: `assets/atlases.json` shaped `{ tiers: { desktop: {suffix, characters, shockwave}, mobile: {...} } }`, and 44 atlas files under `assets/desktop/` and `assets/mobile/`.

The atlas binaries **are committed here**, mirroring the extension, so `npm start` works on a fresh clone with no fetch step.

- [ ] **Step 1: Copy the asset manifest, script and test**

```bash
EXT=/Users/diogolimanicolau/pomium-extension
SHA=7e0a0698f64fa4d54e0b3dbac0b26a715b68cb29
mkdir -p assets scripts
git -C "$EXT" show "$SHA:assets/atlases.json" > assets/atlases.json
git -C "$EXT" show "$SHA:scripts/fetch-assets.sh" > scripts/fetch-assets.sh
git -C "$EXT" show "$SHA:test/assets-manifest.test.js" > test/assets-manifest.test.js
chmod +x scripts/fetch-assets.sh
sed -i '' "s|from '../src/|from '../src/pom/|g" test/assets-manifest.test.js
```

- [ ] **Step 2: Run the test**

Run: `npm test`
Expected: **57 tests, 57 pass** — the two `assets-manifest` tests pass immediately, because they read `assets/atlases.json` and that file was just copied.

There is no red-to-green cycle here: this task copies a file and its test together, so the test has nothing to fail against. The meaningful verification is Step 3, where the script has to actually produce 44 files from that manifest.

- [ ] **Step 3: Fetch the binaries**

Run: `./scripts/fetch-assets.sh`
Expected: a final line `done: 44 files`, no errors. This downloads ~15MB from screen.toys.

- [ ] **Step 4: Confirm the assets are tracked, not ignored**

The extension gitignored these and later un-ignored them; this repo commits them from the start. Check `.gitignore` does not exclude them:

```bash
cat .gitignore
git check-ignore -v assets/desktop/char_01_desktop.webp || echo "not ignored - correct"
```

Expected: `not ignored - correct`. If a rule matches, remove it.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: **57 tests, 57 pass, 0 fail**.

- [ ] **Step 6: Commit**

```bash
git add assets scripts test/assets-manifest.test.js .gitignore
git commit -m "feat: vendor the Pomeranian spritesheets

44 atlas files plus the tier index, committed so a fresh clone runs with no
fetch step. scripts/fetch-assets.sh remains their provenance record and
derives its download list from assets/atlases.json, so swapping the art
means editing that file and re-running the script."
```

---

### Task 3: The overlay canvas

**Files:**
- Create: `src/pom/overlay.js`
- Create: `test/overlay.test.js` (copied)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `canvasBackingSize(cssWidth, cssHeight, dpr) -> { width, height, dpr }` — dpr clamped to `[1,3]`, dimensions floored
  - `attachOverlay(canvas) -> { canvas, ctx, width, height, resize(), destroy() }` — `width`/`height` are **CSS pixels**, `ctx` is pre-scaled by device pixel ratio

This is a rewrite, not a port. The extension's `createOverlay` built its own host `div`, a closed shadow root, and set nine properties `!important` to survive hostile page CSS. None of that applies inside our own chrome. Here the canvas already exists in `index.html`, so the module only measures and sizes it.

`canvasBackingSize` is unchanged, which is why the extension's four tests port.

- [ ] **Step 1: Copy the test and fix its import**

```bash
EXT=/Users/diogolimanicolau/pomium-extension
SHA=7e0a0698f64fa4d54e0b3dbac0b26a715b68cb29
git -C "$EXT" show "$SHA:test/overlay.test.js" > test/overlay.test.js
sed -i '' "s|from '../src/|from '../src/pom/|g" test/overlay.test.js
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/pom/overlay.js`

- [ ] **Step 3: Write `src/pom/overlay.js`**

```js
export function canvasBackingSize(cssWidth, cssHeight, dpr) {
  const ratio = Math.min(3, Math.max(1, dpr || 1));
  return {
    width: Math.floor(cssWidth * ratio),
    height: Math.floor(cssHeight * ratio),
    dpr: ratio,
  };
}

// The canvas already exists in the chrome's own HTML, so unlike the browser
// extension this does not build a host element or a shadow root: there is no
// hostile page CSS to defend against here. It only measures and sizes.
export function attachOverlay(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let destroyed = false;

  const overlay = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    resize() {
      if (destroyed) return;
      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width || window.innerWidth;
      const cssHeight = rect.height || window.innerHeight;
      const size = canvasBackingSize(cssWidth, cssHeight, window.devicePixelRatio);
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      overlay.width = cssWidth;
      overlay.height = cssHeight;
    },
    destroy() {
      destroyed = true;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    },
  };

  overlay.resize();
  return overlay;
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: **61 tests, 61 pass, 0 fail**.

- [ ] **Step 5: Commit**

```bash
git add src/pom/overlay.js test/overlay.test.js
git commit -m "feat: add the overlay canvas module

canvasBackingSize comes across unchanged with its four tests. attachOverlay
is a rewrite rather than a port: the extension built a host div inside a
closed shadow root with nine !important properties to survive hostile page
CSS, and none of that applies inside our own trusted chrome. The canvas
lives in index.html; this only measures and sizes it."
```

---

### Task 4: The filesystem atlas loader

**Files:**
- Create: `src/pom/atlas-loader.js`

**Interfaces:**
- Consumes: `parseAtlas(json)` from `src/pom/atlas.js`.
- Produces: `createAtlasLoader({ tier, assetsDir }) -> load(key)` returning `{ image: ImageBitmap, frames }`.

No unit test, by the same reasoning the extension applied to its own loader: it is pure I/O, and a stubbed test would only restate the implementation. It is verified in the running app in Task 10.

The extension used `fetch` plus `chrome.runtime.getURL` because a strict page `img-src` CSP can block an extension-URL image element while a content-script fetch cannot. Irrelevant here — the renderer is our own chrome with Node integration — so this reads the files directly.

- [ ] **Step 1: Write `src/pom/atlas-loader.js`**

```js
import { parseAtlas } from './atlas.js';

// The renderer runs with nodeIntegration, so atlases are read straight off
// disk. The extension had to fetch them to dodge page CSP; that constraint
// does not exist inside our own chrome.
export function createAtlasLoader({ tier, assetsDir }) {
  return async function load(key) {
    const { readFile } = require('node:fs/promises');
    const path = require('node:path');

    const base = path.join(assetsDir, tier, `${key}_${tier}`);
    const json = JSON.parse(await readFile(`${base}.json`, 'utf8'));
    const parsed = parseAtlas(json);

    const bytes = await readFile(path.join(assetsDir, tier, parsed.image));
    const blob = new Blob([bytes], { type: 'image/webp' });
    const image = await createImageBitmap(blob);

    return { image, frames: parsed.frames };
  };
}
```

- [ ] **Step 2: Confirm the suite is unchanged**

Run: `npm test`
Expected: **61 tests, 61 pass, 0 fail** — this module has no tests and must not affect the others.

- [ ] **Step 3: Commit**

```bash
git add src/pom/atlas-loader.js
git commit -m "feat: load atlases from disk instead of through a CSP

The extension fetched atlases and decoded them via createImageBitmap
specifically because a strict page img-src CSP can block an extension-URL
image element while a content-script fetch cannot. The renderer here is our
own chrome with Node integration, so it reads the files directly.

Untested by design, as in the extension: this is pure I/O and a stub would
only restate it. Task 10 verifies it in the running app."
```

---

### Task 5: Page-to-window coordinate translation

**Files:**
- Create: `src/pom/coords.js`
- Test: `test/coords.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `windowPoint(pageX, pageY, paneRect) -> { x, y }` where `paneRect` is anything with numeric `left` and `top` (a `DOMRect`, or a plain object in tests).

This is the only genuinely new logic in the port. A `<webview>` is a separate frame, so a click inside a page reports coordinates relative to that pane, not the window. The single window-wide canvas needs window-space coordinates.

- [ ] **Step 1: Write the failing test**

`test/coords.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { windowPoint } from '../src/pom/coords.js';

test('adds the pane offset to page coordinates', () => {
  assert.deepEqual(windowPoint(10, 20, { left: 0, top: 96 }), { x: 10, y: 116 });
});

test('a click at the pane origin lands at the pane offset', () => {
  assert.deepEqual(windowPoint(0, 0, { left: 4, top: 96 }), { x: 4, y: 96 });
});

test('a pane at the window origin is a pass-through', () => {
  assert.deepEqual(windowPoint(37, 51, { left: 0, top: 0 }), { x: 37, y: 51 });
});

test('fractional pane offsets are preserved, not rounded', () => {
  const p = windowPoint(10, 10, { left: 0.5, top: 95.5 });
  assert.equal(p.x, 10.5);
  assert.equal(p.y, 105.5);
});

test('a missing rect is treated as the window origin', () => {
  assert.deepEqual(windowPoint(5, 6, null), { x: 5, y: 6 });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/pom/coords.js`

- [ ] **Step 3: Write `src/pom/coords.js`**

```js
// A <webview> is a separate frame, so a click inside a page reports
// coordinates relative to that pane. The overlay canvas spans the whole
// window, so those have to be shifted by where the pane sits.
export function windowPoint(pageX, pageY, paneRect) {
  const left = paneRect ? paneRect.left : 0;
  const top = paneRect ? paneRect.top : 0;
  return { x: pageX + left, y: pageY + top };
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: **66 tests, 66 pass, 0 fail**.

- [ ] **Step 5: Commit**

```bash
git add src/pom/coords.js test/coords.test.js
git commit -m "feat: translate page coordinates into window space

A webview is a separate frame, so a click inside a page reports coordinates
relative to that pane while the overlay canvas spans the whole window. This
is the only new logic the port needs, so it gets tests: pane offsets, a
click at a pane's exact origin, fractional offsets, and a null rect."
```

---

### Task 6: The Poms controller

**Files:**
- Create: `src/pom/index.js`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4.
- Produces: `createPoms({ canvas, assetsDir, onShake }) -> { pointerDown(x), pointerMove(x), pointerUp(), resize(), destroy() }`

This adapts the extension's `src/main.js`. Four deliberate differences:

1. **It owns no listeners.** The extension attached its own `document` listeners; here clicks arrive from two sources (the host document and IPC from webview preloads), so the renderer owns the listeners and calls in. This module exposes the verbs instead.
2. **No `isTrusted` checks.** Those existed because a hostile page could dispatch synthetic events at a content script. Neither our trusted chrome nor an IPC message from our own preload has that exposure.
3. **The tier is always `desktop`.** A desktop browser window is never below the mobile breakpoint.
4. **`onShake` receives the camera offset**, and `renderScene` gets rotation only — see the shake split in Global Constraints.

- [ ] **Step 1: Write `src/pom/index.js`**

```js
import { IDLE_TEARDOWN_MS, ATLAS_CACHE_LIMIT } from './config.js';
import { attachOverlay } from './overlay.js';
import { createEngine, createRoster } from './engine.js';
import { createAtlasCache } from './atlas.js';
import { createAtlasLoader } from './atlas-loader.js';
import { createLoop } from './loop.js';
import { renderScene } from './render.js';

// Pre-decode defaults used only to size a sprite before its atlas has
// loaded; the decoded atlas is the real source of truth once it lands.
const FRAME_COUNTS = { shockwave: 17 };
const DEFAULT_CHARACTER_FRAMES = 96;

// A desktop browser window is never below the mobile breakpoint.
const TIER = 'desktop';

export function createPoms({ canvas, assetsDir, onShake }) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { pointerDown() {}, pointerMove() {}, pointerUp() {}, resize() {}, destroy() {} };
  }

  let overlay = null;
  let engine = null;
  let loop = null;
  let cache = null;
  let roster = null;
  let idleTimer = null;

  function frameCountFor(key) {
    return FRAME_COUNTS[key] ?? DEFAULT_CHARACTER_FRAMES;
  }

  function warm(key) {
    cache.get(key).catch(() => {});
  }

  // A transient decode failure would otherwise kill that character for the
  // session, since the renderer only ever peeks the cache. Re-warm whatever
  // the roster is missing on each press, so a failure heals on the next click.
  function rewarmMissing() {
    if (!cache || !roster) return;
    if (!cache.peek('shockwave')) warm('shockwave');
    for (const key of roster) {
      if (!cache.peek(key)) warm(key);
    }
  }

  function teardown() {
    if (loop) loop.stop();
    if (overlay) overlay.destroy();
    if (cache) cache.clear();
    overlay = null; engine = null; loop = null; cache = null;
    roster = null; idleTimer = null;
    if (onShake) onShake(0, 0, true);
  }

  function scheduleIdleCheck() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (engine && engine.isIdle) teardown();
      else if (engine) scheduleIdleCheck();
    }, IDLE_TEARDOWN_MS);
  }

  function ensureStarted() {
    if (engine) {
      if (!loop.running) loop.start();
      return;
    }

    try {
      overlay = attachOverlay(canvas);
      cache = createAtlasCache({
        limit: ATLAS_CACHE_LIMIT,
        load: createAtlasLoader({ tier: TIER, assetsDir }),
      });

      // One roster per session, so at most ROSTER_SIZE + 1 atlases are live.
      roster = createRoster();
      warm('shockwave');
      for (const key of roster) warm(key);

      engine = createEngine({
        width: overlay.width,
        height: overlay.height,
        roster,
        frameCountFor,
      });

      loop = createLoop({
        update: () => {
          engine.update();
          // The window takes x/y; the canvas takes rotation. Sending both to
          // both would double the shake.
          if (onShake) onShake(engine.camera.x, engine.camera.y, engine.isIdle);
          if (engine.isIdle) loop.stop();
        },
        render: () => renderScene(overlay.ctx, {
          sprites: engine.sprites,
          camera: { x: 0, y: 0, rotation: engine.camera.rotation },
          atlases: { get: (key) => cache.peek(key) },
          width: overlay.width,
          height: overlay.height,
        }),
      });
      loop.start();
      scheduleIdleCheck();
    } catch (error) {
      // Never break the browser chrome. If any of this throws, leaving engine
      // non-null would throw again on every later click, forever.
      console.warn('[pomium] failed to start', error);
      if (overlay) overlay.destroy();
      overlay = null; engine = null; loop = null; cache = null; roster = null;
    }
  }

  return {
    pointerDown(x) {
      ensureStarted();
      if (!engine) return;
      rewarmMissing();
      engine.pointerDown(x);
    },
    pointerMove(x) {
      if (engine) engine.pointerMove(x);
    },
    pointerUp() {
      if (engine) engine.pointerUp();
    },
    resize() {
      if (!overlay || !engine) return;
      overlay.resize();
      engine.resize(overlay.width, overlay.height);
    },
    destroy: teardown,
  };
}
```

- [ ] **Step 2: Confirm the suite is unchanged**

Run: `npm test`
Expected: **66 tests, 66 pass, 0 fail**.

- [ ] **Step 3: Commit**

```bash
git add src/pom/index.js
git commit -m "feat: add the Poms controller

Adapts the extension's wiring to this host. It owns no listeners: clicks
arrive from the host document and from webview preloads over IPC, so the
renderer owns those and calls these verbs instead. The isTrusted checks are
gone, since neither our own chrome nor our own preload can be spoofed by a
page the way a content script could. The tier is always desktop.

The camera offset goes to onShake for the window to apply, while renderScene
receives rotation only, so the shake is not applied twice."
```

---

### Task 7: Forward pointer events from pages

**Files:**
- Modify: `src/webview-preload.js` (replace entirely)

**Interfaces:**
- Consumes: nothing.
- Produces: three IPC channels to the host — `pom-down` and `pom-move` each carrying `{ x, y }` in page coordinates, and `pom-up` carrying nothing.

The existing preload forwards only `click`, which cannot express a held drag. Hold-and-drag streaming needs the press, the moves and the release as separate events.

- [ ] **Step 1: Replace `src/webview-preload.js`**

```js
// Runs inside each <webview> page, isolated from the host chrome. A webview
// is a separate frame, so its clicks never reach the host document — they are
// forwarded here and translated into window coordinates by the renderer.
//
// Press, move and release are forwarded separately rather than as a single
// click, because holding and dragging streams poms continuously and a click
// event cannot express that.
const { ipcRenderer } = require('electron');

// Listeners are passive and never call preventDefault or stopPropagation, so
// the page keeps receiving every event exactly as it would without Pomium.
const OPTS = { capture: true, passive: true };

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    ipcRenderer.sendToHost('pom-down', { x: e.clientX, y: e.clientY });
  }, OPTS);

  document.addEventListener('pointermove', (e) => {
    ipcRenderer.sendToHost('pom-move', { x: e.clientX, y: e.clientY });
  }, OPTS);

  document.addEventListener('pointerup', (e) => {
    // Mirror the pointerdown filter: a chorded right-click release must not
    // end a drag the user is still physically holding.
    if (e.button !== undefined && e.button !== 0) return;
    ipcRenderer.sendToHost('pom-up');
  }, OPTS);

  document.addEventListener('pointercancel', () => {
    ipcRenderer.sendToHost('pom-up');
  }, OPTS);

  // A drag can end without pointerup: alt-tabbing away, or a native drag
  // starting on an image or link. Without these the stream never stops.
  window.addEventListener('blur', () => ipcRenderer.sendToHost('pom-up'), OPTS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ipcRenderer.sendToHost('pom-up');
  }, OPTS);
});
```

- [ ] **Step 2: Confirm the suite is unchanged**

Run: `npm test`
Expected: **66 tests, 66 pass, 0 fail**.

- [ ] **Step 3: Commit**

```bash
git add src/webview-preload.js
git commit -m "feat: forward press, move and release from pages

The preload forwarded only click, which cannot express a held drag. Hold and
drag streams poms continuously, so press, move and release now travel as
separate IPC messages. Blur and visibilitychange also send a release,
because a drag can end without ever delivering pointerup — alt-tabbing away
or starting a native drag on an image would otherwise stream forever."
```

---

### Task 8: Wire the renderer and remove the SVG effect

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/renderer.js`
- Modify: `src/renderer/styles.css`
- Delete: `src/pom-bomb.js`, `src/pom-bomb.css`

**Interfaces:**
- Consumes: `createPoms({canvas, assetsDir, onShake})` from `src/pom/index.js`, `windowPoint(pageX, pageY, paneRect)` from `src/pom/coords.js`.
- Produces: a live overlay driven by both click sources. Sends `pom-shake` IPC to main (implemented in Task 9).

- [ ] **Step 1: Update `src/renderer/index.html`**

Remove the two `pom-bomb` lines and add the canvas plus a module entry. The canvas is last in the body so it paints above everything, and the module script is separate from the CommonJS `renderer.js`.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Pomium</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div id="tab-strip">
    <div id="tabs"></div>
    <button id="new-tab-btn" title="New tab">+</button>
  </div>
  <div id="toolbar">
    <button id="back-btn" title="Back">&#8592;</button>
    <button id="fwd-btn" title="Forward">&#8594;</button>
    <button id="reload-btn" title="Reload">&#8635;</button>
    <input id="address-bar" type="text" placeholder="Search or enter address" />
    <button id="go-btn" title="Go">Go</button>
  </div>
  <div id="content"></div>
  <canvas id="pom-overlay"></canvas>

  <script src="./renderer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add the overlay style to `src/renderer/styles.css`**

Append:

```css
/* Spans the whole window so poms fly over the tab strip and toolbar too.
   pointer-events:none keeps every click reaching what it landed on. */
#pom-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2147483647;
}
```

- [ ] **Step 3: Remove the per-tab overlay from `createTab` in `src/renderer/renderer.js`**

Delete these three lines:

```js
  const overlay = document.createElement('div');
  overlay.className = 'pom-overlay';
```

and

```js
  pane.appendChild(overlay);
```

Change the tab record from `{ id, webview, pane, overlay, tabBtn, titleSpan }` to `{ id, webview, pane, tabBtn, titleSpan }`.

Replace the whole `ipc-message` listener:

```js
  webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'pom-click') {
      const { x, y } = e.args[0];
      window.spawnPomBomb(x, y, overlay);
    }
  });
```

with:

```js
  webview.addEventListener('ipc-message', (e) => {
    if (!poms) return;
    const rect = pane.getBoundingClientRect();
    if (e.channel === 'pom-down') {
      poms.pointerDown(windowPoint(e.args[0].x, e.args[0].y, rect).x);
    } else if (e.channel === 'pom-move') {
      poms.pointerMove(windowPoint(e.args[0].x, e.args[0].y, rect).x);
    } else if (e.channel === 'pom-up') {
      poms.pointerUp();
    }
  });
```

- [ ] **Step 4: Add the Poms bootstrap at the top of `src/renderer/renderer.js`**

After the existing `const path = require('path');` line, add:

```js
const { ipcRenderer } = require('electron');

// src/pom/ is ESM (scoped by its own package.json) while this file is
// CommonJS, so it is pulled in with a dynamic import.
let poms = null;
let windowPoint = (x, y, rect) => ({ x: x + (rect ? rect.left : 0), y: y + (rect ? rect.top : 0) });

(async () => {
  const pomUrl = 'file://' + path.join(__dirname, '..', 'pom', 'index.js');
  const coordsUrl = 'file://' + path.join(__dirname, '..', 'pom', 'coords.js');
  const [{ createPoms }, coords] = await Promise.all([import(pomUrl), import(coordsUrl)]);
  windowPoint = coords.windowPoint;

  poms = createPoms({
    canvas: document.getElementById('pom-overlay'),
    assetsDir: path.join(__dirname, '..', '..', 'assets'),
    onShake: (x, y, settled) => ipcRenderer.send('pom-shake', { x, y, settled }),
  });

  // Clicks on the chrome itself — tab strip, toolbar, address bar — spawn too.
  // Page clicks cannot reach here; they arrive over IPC in createTab.
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    poms.pointerDown(e.clientX);
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', (e) => {
    poms.pointerMove(e.clientX);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    poms.pointerUp();
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => poms.pointerUp(), { capture: true, passive: true });
  window.addEventListener('blur', () => poms.pointerUp(), { passive: true });

  window.addEventListener('resize', () => poms.resize(), { passive: true });
})();
```

- [ ] **Step 5: Delete the SVG effect**

```bash
git rm src/pom-bomb.js src/pom-bomb.css
```

- [ ] **Step 6: Confirm the suite and that nothing references the old effect**

Run: `npm test`
Expected: **66 tests, 66 pass, 0 fail**.

Run: `grep -rn "spawnPomBomb\|pom-bomb" src/ || echo "no references - correct"`
Expected: `no references - correct`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: drive the overlay from both click sources

One canvas spans the whole window, so poms fly over the tab strip and
toolbar as well as the page. Chrome clicks reach the host document directly;
page clicks arrive over IPC and are translated into window space by the
originating pane's rect. The per-tab overlay divs and the inline-SVG effect
they existed for are gone.

renderer.js is CommonJS and src/pom/ is ESM, so the controller is pulled in
with a dynamic import."
```

---

### Task 9: Shake the window

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: the `pom-shake` IPC channel sent by the renderer, carrying `{ x, y, settled }`.
- Produces: window movement via `setBounds`.

The subtle part is the resting position. It is captured when a shake begins and restored when the shake settles, and it must be re-read whenever the window is idle — otherwise moving the window by hand between shakes would teleport it back to where it sat during the last one.

- [ ] **Step 1: Add the shake handler to `src/main.js`**

Add `ipcMain` to the require, and after `createWindow()` is defined, register the handler. Full file:

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

// The window physically jolts on every spawn, so its resting position has to
// be remembered and restored. It is re-read whenever the shake has settled,
// otherwise moving the window by hand between shakes would teleport it back
// to wherever it sat during the last one.
let restingBounds = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Pomium',
    backgroundColor: '#1e1f24',
    webPreferences: {
      // Trusted host chrome (our own UI, not remote content) gets Node so
      // renderer.js can manage <webview> tabs directly.
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
      restingBounds = null;
    }
  });
}

ipcMain.on('pom-shake', (_event, { x, y, settled }) => {
  const win = mainWindow;
  if (!win || win.isDestroyed() || win.isFullScreen() || win.isMaximized()) return;

  if (settled) {
    if (restingBounds) {
      win.setBounds(restingBounds);
      restingBounds = null;
    }
    return;
  }

  if (!restingBounds) restingBounds = win.getBounds();
  win.setBounds({
    x: Math.round(restingBounds.x + x),
    y: Math.round(restingBounds.y + y),
    width: restingBounds.width,
    height: restingBounds.height,
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

Note the maximised and fullscreen guard: `setBounds` on a maximised window either fights the window manager or silently un-maximises it, and neither is wanted.

- [ ] **Step 2: Confirm the suite is unchanged**

Run: `npm test`
Expected: **66 tests, 66 pass, 0 fail**.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: shake the OS window on every spawn

The engine's camera offset moves the actual window through setBounds rather
than transforming the canvas. Rotation stays on the canvas, since a window
cannot rotate.

The resting position is captured when a shake starts and restored when it
settles, and re-read once settled so moving the window by hand between
shakes does not teleport it back. Maximised and fullscreen windows are
skipped: setBounds there either fights the window manager or silently
un-maximises."
```

---

### Task 10: Verify in the app, and document

**Files:**
- Create: `docs/manual-verification.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the finished app.
- Produces: a checklist a human can follow, and a README describing what is actually true.

Nothing here is unit-testable. This task is where the port is proven.

- [ ] **Step 1: Run the app and work the checklist**

Run: `npm install && npm start`

Check each, and record the result in the report:

- [ ] A pom pair and a fire shockwave appear on a click in a page, sweeping down and to the right
- [ ] Clicking the tab strip or the address bar also spawns — the poms fly over the chrome, not just the page
- [ ] Clicking near the left edge enters higher and steeper than clicking near the right edge
- [ ] Holding and dragging streams poms continuously
- [ ] The window physically jolts on each spawn and returns to rest afterwards
- [ ] Moving the window by hand between clicks, then clicking again, shakes from the new position and does not teleport
- [ ] Links still navigate, the address bar still focuses and accepts typing
- [ ] Switching tabs mid-animation does not interrupt the poms
- [ ] Opening a second tab and clicking in it spawns at the correct place
- [ ] DevTools console is clean

- [ ] **Step 2: Write `docs/manual-verification.md`**

Record the checklist above with, for each item, the exact expected result and what a failure would mean. State plainly at the top which parts of the system have automated coverage (the engine, 66 tests) and which do not (the overlay, the loader, the IPC plumbing, the shake).

- [ ] **Step 3: Rewrite `README.md`**

It currently describes the inline-SVG effect and claims no external assets. Both are now false. Cover: what it is, `npm install && npm start`, the file layout including `src/pom/`, that the artwork is committed spritesheets by shapiro500 from screen.toys with `scripts/fetch-assets.sh` as their provenance record, the test story, and the known limitations — the window does not shake when maximised or fullscreen, and drag-to-select on a page is impractical while a stream shakes the window.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add the manual verification checklist and rewrite the README

The README described the inline-SVG effect and claimed no external assets;
both are now false. It also records what the 66 automated tests cover and
what only a human running the app can check."
```

---

## Self-review notes

**Spec coverage.** Overlay scope (Task 8), triggers from both sources (Tasks 7, 8), drag streaming (Tasks 7, 8), committed artwork (Task 2), window shake (Task 9), continuous shake during drag (Task 9 — no suppression is implemented, matching the decision), ported modules and tests (Task 1), the two rewrites (Tasks 3, 4), coordinate translation (Task 5), deletion of the SVG effect (Task 8), out-of-scope items untouched.

**Test count.** 55 after Task 1, 57 after Task 2, 61 after Task 3, 66 after Task 5, and 66 thereafter. The spec's "61 ported" is the sum of Tasks 1-3.

**Known risk not designed away.** `setBounds` runs up to 30 times per second during a sustained drag. If that is visibly janky, the fallback is to send `pom-shake` only on every second update, which halves the IPC without changing the feel much. Not implemented pre-emptively.
