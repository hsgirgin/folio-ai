const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createNoteRepository } = require('./lib/noteRepository');

const noteRepository = createNoteRepository({
  baseDir: path.join(app.getPath('userData'), 'notes')
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function registerNoteHandlers() {
  ipcMain.handle('notes:list', () => noteRepository.listNotes());
  ipcMain.handle('notes:get', (_event, id) => noteRepository.getNote(id));
  ipcMain.handle('notes:create', (_event, payload) => noteRepository.createNote(payload));
  ipcMain.handle('notes:update', (_event, id, updates) => noteRepository.updateNote(id, updates));
  ipcMain.handle('notes:delete', (_event, id) => noteRepository.deleteNote(id));
  ipcMain.handle('notes:export', () => noteRepository.exportNotes());
}

app.whenReady().then(async () => {
  await noteRepository.initialize();
  registerNoteHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
