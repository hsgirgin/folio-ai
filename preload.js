const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folioAPI', {
  config: {
    platform: 'electron',
    ai: {
      defaultProviderId: 'ollama-local',
      providers: [
        {
          id: 'ollama-local',
          label: 'Local Ollama',
          endpoint: 'http://localhost:11434'
        }
      ],
      defaultModelPresetId: 'quick',
      modelPresets: [
        {
          id: 'quick',
          label: 'Quick',
          model: 'llama3.1:8b'
        },
        {
          id: 'quality',
          label: 'Quality',
          model: 'gpt-oss:120b-cloud'
        }
      ]
    }
  },
  notes: {
    listNotes: () => ipcRenderer.invoke('notes:list'),
    getNote: (id) => ipcRenderer.invoke('notes:get', id),
    createNote: (payload) => ipcRenderer.invoke('notes:create', payload),
    updateNote: (id, updates) => ipcRenderer.invoke('notes:update', id, updates),
    deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
    exportNotes: () => ipcRenderer.invoke('notes:export')
  }
});
