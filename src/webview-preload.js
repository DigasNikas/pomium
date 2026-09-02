// Runs inside each <webview> page (isolated from the host chrome). Forwards
// click coordinates to the host so the pom-bomb overlay is positioned
// correctly relative to the tab's own viewport.
const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener(
    'click',
    (e) => {
      ipcRenderer.sendToHost('pom-click', { x: e.clientX, y: e.clientY });
    },
    true
  );
});
