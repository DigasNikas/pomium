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
  // The preload script is ours, but the DOM events it listens to are the
  // page's — a page can dispatch synthetic pointer events on its own
  // document to hold this flag forever. isTrusted rejects anything that
  // did not come from a real input device.
  let held = false;

  document.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted) return;
    if (e.button !== undefined && e.button !== 0) return;
    held = true;
    ipcRenderer.sendToHost('pom-down', { x: e.clientX, y: e.clientY });
  }, OPTS);

  document.addEventListener('pointermove', (e) => {
    if (!e.isTrusted) return;
    if (!held) return;
    ipcRenderer.sendToHost('pom-move', { x: e.clientX, y: e.clientY });
  }, OPTS);

  document.addEventListener('pointerup', (e) => {
    if (!e.isTrusted) return;
    // Mirror the pointerdown filter: a chorded right-click release must not
    // end a drag the user is still physically holding.
    if (e.button !== undefined && e.button !== 0) return;
    held = false;
    ipcRenderer.sendToHost('pom-up');
  }, OPTS);

  document.addEventListener('pointercancel', (e) => {
    if (!e.isTrusted) return;
    held = false;
    ipcRenderer.sendToHost('pom-up');
  }, OPTS);

  // A drag can end without pointerup: alt-tabbing away, or a native drag
  // starting on an image or link. Without these the stream never stops.
  // Left unconditional (unlike the pointer handlers above): a page firing
  // these itself can only end a drag early, never extend one, so an
  // isTrusted guard here would add nothing.
  window.addEventListener('blur', () => {
    held = false;
    ipcRenderer.sendToHost('pom-up');
  }, OPTS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      held = false;
      ipcRenderer.sendToHost('pom-up');
    }
  }, OPTS);
});
