const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

function ensureOllamaRunning() {
  try {
    const proc = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();
  } catch (err) {
    console.error('Failed to start Ollama:', err);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ensureOllamaRunning();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});