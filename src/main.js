const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

// The window physically jolts on every spawn, so its resting position has to
// be remembered and restored. It is re-read whenever the shake has settled,
// otherwise moving the window by hand between shakes would teleport it back
// to wherever it sat during the last one.
//
// Only x/y are tracked: pinning width/height would revert a resize the user
// starts mid-shake, and a held drag re-arms the shake every other update, so
// the window would be unresizable for as long as the pointer is down.
let restingBounds = null;

// Where to put the window back once it leaves maximise or fullscreen.
// Entering either snapshots the window's *current* frame as the one to
// restore to later, and if a shake had it displaced at that instant the
// snapshot is the displaced spot — every such transition would drift the
// window by another jolt. Handing the true resting position back on the way
// out corrects that regardless of what the OS captured.
let preTransitionBounds = null;

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

  // These fire on every route into maximise/fullscreen — the window buttons,
  // F11, double-clicking the draggable tab strip — which polling isMaximized()
  // from the shake handler cannot cover, since by then the OS has already
  // snapshotted the displaced frame.
  const enterTransition = () => {
    if (!restingBounds) return;
    preTransitionBounds = restingBounds;
    restingBounds = null;
  };
  const leaveTransition = () => {
    if (!preTransitionBounds) return;
    const bounds = preTransitionBounds;
    preTransitionBounds = null;
    if (win.isDestroyed()) return;
    win.setBounds({ x: bounds.x, y: bounds.y });
  };
  win.on('maximize', enterTransition);
  win.on('enter-full-screen', enterTransition);
  win.on('unmaximize', leaveTransition);
  win.on('leave-full-screen', leaveTransition);

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
      restingBounds = null;
      preTransitionBounds = null;
    }
  });
}

// Assumes a single window: the handler always targets mainWindow rather than
// the sender. That holds today because `activate` only ever creates one
// window when none exist. If a "new window" feature is added, this would
// need to resolve the sender via BrowserWindow.fromWebContents instead.
ipcMain.on('pom-shake', (_event, payload = {}) => {
  const { x = 0, y = 0, settled = false } = payload;
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  // Moot while maximised or fullscreen. The transition handlers in
  // createWindow already took the resting position off restingBounds, so
  // there is no stale base left here to teleport the window with later.
  if (win.isFullScreen() || win.isMaximized()) return;

  if (settled) {
    if (restingBounds) {
      win.setBounds({ x: restingBounds.x, y: restingBounds.y });
      restingBounds = null;
    }
    return;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  if (!restingBounds) {
    const { x: restX, y: restY } = win.getBounds();
    restingBounds = { x: restX, y: restY };
  }
  win.setBounds({
    x: Math.round(restingBounds.x + x),
    y: Math.round(restingBounds.y + y),
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
