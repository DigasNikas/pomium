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
