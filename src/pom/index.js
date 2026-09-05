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
  let resizeHandle = null;
  // Last offset handed to onShake. The shake decays in SHAKE_DURATION updates
  // but sprites live far longer, so an unconditional send would repeat the
  // same settled payload across the process boundary for the rest of their
  // life and the whole idle window after it.
  let lastShake = null;

  function emitShake(x, y, settled) {
    if (!onShake) return;
    if (lastShake && lastShake.x === x && lastShake.y === y && lastShake.settled === settled) return;
    lastShake = { x, y, settled };
    onShake(x, y, settled);
  }

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
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (resizeHandle !== null) {
      cancelAnimationFrame(resizeHandle);
      resizeHandle = null;
    }
    overlay = null; engine = null; loop = null; cache = null;
    roster = null;
    lastShake = null;
    emitShake(0, 0, true);
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
      scheduleIdleCheck();
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
          // isIdle means "no sprites left" — 96 frames — but the shake decays in 8
          // updates. Treating a zero offset as settled releases the window as soon as
          // the jolt actually ends, instead of pinning it for the sprite's whole life.
          const settled = engine.isIdle || (engine.camera.x === 0 && engine.camera.y === 0);
          emitShake(engine.camera.x, engine.camera.y, settled);
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
      if (cache) cache.clear();
      overlay = null; engine = null; loop = null; cache = null; roster = null;
      lastShake = null;
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
      // The window fires resize continuously during a drag, and each resize
      // reallocates a full-viewport backing store. Coalesce to one per frame.
      if (resizeHandle !== null) return;
      resizeHandle = requestAnimationFrame(() => {
        resizeHandle = null;
        if (!overlay || !engine) return;
        overlay.resize();
        engine.resize(overlay.width, overlay.height);
      });
    },
    destroy: teardown,
  };
}
