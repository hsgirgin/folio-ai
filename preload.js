const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('folioAPI', {
  ollamaUrl: 'http://localhost:11434'
});