const path = require('path');
const { ipcRenderer } = require('electron');

// src/pom/ is ESM (scoped by its own package.json) while this file is
// CommonJS, so it is pulled in with a dynamic import.
let poms = null;
let windowX = null;

// Which document started the drag in progress: 'chrome', 'webview', or null
// when nothing is held. Focus crossing between the host chrome and a
// <webview> fires blur on whichever side is losing it, and a blur handler
// that released unconditionally would kill a drag the user is still
// physically holding. Whoever owns the drag owns its release.
let dragSource = null;

(async () => {
  const pomUrl = 'file://' + path.join(__dirname, '..', 'pom', 'index.js');
  const coordsUrl = 'file://' + path.join(__dirname, '..', 'pom', 'coords.js');
  const [{ createPoms }, coords] = await Promise.all([import(pomUrl), import(coordsUrl)]);
  windowX = coords.windowX;

  poms = createPoms({
    canvas: document.getElementById('pom-overlay'),
    assetsDir: path.join(__dirname, '..', '..', 'assets'),
    onShake: (x, y, settled) => ipcRenderer.send('pom-shake', { x, y, settled }),
  });

  // Clicks on the chrome itself — tab strip, toolbar, address bar — spawn too.
  // Page clicks cannot reach here; they arrive over IPC in createTab.
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragSource = 'chrome';
    poms.pointerDown(e.clientX);
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', (e) => {
    // The engine only reads the pointer position while a chrome drag is
    // held, so an unguarded handler would do a call per mouse move for
    // nothing. Mirrors the held check in webview-preload.js.
    if (dragSource !== 'chrome') return;
    poms.pointerMove(e.clientX);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragSource = null;
    poms.pointerUp();
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => {
    dragSource = null;
    poms.pointerUp();
  }, { capture: true, passive: true });
  window.addEventListener('blur', () => {
    // Pressing into a <webview> blurs the host document even though the
    // pointer never left the window. The page's own preload mirrors this
    // handler for real window-level focus loss, so the webview releases
    // its own drags and this one must not.
    if (dragSource === 'webview') return;
    dragSource = null;
    poms.pointerUp();
  }, { passive: true });

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

  // pom-move only arrives while a drag is held (see webview-preload.js), so
  // the pane's rect only needs reading once per drag rather than per message.
  let dragRect = null;

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
    if (e.channel === 'pom-down') {
      const { x = 0 } = e.args[0] || {};
      dragRect = pane.getBoundingClientRect();
      dragSource = 'webview';
      poms.pointerDown(windowX(x, dragRect));
    } else if (e.channel === 'pom-move') {
      const { x = 0 } = e.args[0] || {};
      poms.pointerMove(windowX(x, dragRect));
    } else if (e.channel === 'pom-up') {
      dragRect = null;
      dragSource = null;
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
