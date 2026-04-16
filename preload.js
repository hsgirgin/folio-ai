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
          label: 'Quick Local',
          model: 'llama3.1:8b'
        },
        {
          id: 'quality',
          label: 'Quality Cloud',
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
  },
  sections: {
    listSections: () => ipcRenderer.invoke('sections:list'),
    createSection: (payload) => ipcRenderer.invoke('sections:create', payload),
    updateSection: (id, updates) => ipcRenderer.invoke('sections:update', id, updates),
    deleteSection: (id) => ipcRenderer.invoke('sections:delete', id)
  }
});
