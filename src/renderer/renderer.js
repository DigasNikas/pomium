const path = require('path');
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

const WEBVIEW_PRELOAD_URL = 'file://' + path.join(__dirname, '..', 'webview-preload.js');
const DEFAULT_URL = 'https://www.google.com';

const tabsEl = document.getElementById('tabs');
const contentEl = document.getElementById('content');
const addressBar = document.getElementById('address-bar');

let tabs = [];
let activeId = null;

function normalizeUrl(input) {
  input = (input || '').trim();
  if (!input) return DEFAULT_URL;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return input;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(input) && !input.includes(' ')) {
    return 'https://' + input;
  }
  return 'https://www.google.com/search?q=' + encodeURIComponent(input);
}

function currentTab() {
  return tabs.find((t) => t.id === activeId);
}

function createTab(url) {
  const id = 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

  const webview = document.createElement('webview');
  webview.className = 'browser-webview';
  webview.setAttribute('preload', WEBVIEW_PRELOAD_URL);
  webview.setAttribute('allowpopups', '');
  webview.src = url || DEFAULT_URL;

  const pane = document.createElement('div');
  pane.className = 'webview-pane';
  pane.appendChild(webview);
  contentEl.appendChild(pane);

  const titleSpan = document.createElement('span');
  titleSpan.className = 'tab-title';
  titleSpan.textContent = 'New Tab';

  const closeBtn = document.createElement('span');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(id);
  });

  const tabBtn = document.createElement('div');
  tabBtn.className = 'tab';
  tabBtn.appendChild(titleSpan);
  tabBtn.appendChild(closeBtn);
  tabBtn.addEventListener('click', () => activateTab(id));
  tabsEl.appendChild(tabBtn);

  const tab = { id, webview, pane, tabBtn, titleSpan };
  tabs.push(tab);

  webview.addEventListener('page-title-updated', (e) => {
    titleSpan.textContent = e.title;
  });
  webview.addEventListener('did-navigate', (e) => {
    if (tab.id === activeId) addressBar.value = e.url;
  });
  webview.addEventListener('did-navigate-in-page', (e) => {
    if (tab.id === activeId) addressBar.value = e.url;
  });
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

  activateTab(id);
  return tab;
}

function activateTab(id) {
  activeId = id;
  tabs.forEach((t) => {
    const active = t.id === id;
    t.pane.classList.toggle('active', active);
    t.tabBtn.classList.toggle('active', active);
    if (active) addressBar.value = t.webview.src;
  });
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [tab] = tabs.splice(idx, 1);
  tab.pane.remove();
  tab.tabBtn.remove();
  if (tabs.length === 0) {
    createTab();
    return;
  }
  if (activeId === id) {
    activateTab(tabs[Math.max(0, idx - 1)].id);
  }
}

function go() {
  const tab = currentTab();
  if (tab) tab.webview.loadURL(normalizeUrl(addressBar.value));
}

document.getElementById('new-tab-btn').addEventListener('click', () => createTab());
document.getElementById('back-btn').addEventListener('click', () => currentTab()?.webview.goBack());
document.getElementById('fwd-btn').addEventListener('click', () => currentTab()?.webview.goForward());
document.getElementById('reload-btn').addEventListener('click', () => currentTab()?.webview.reload());
document.getElementById('go-btn').addEventListener('click', go);
addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') go();
});

createTab(DEFAULT_URL);
