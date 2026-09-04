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
