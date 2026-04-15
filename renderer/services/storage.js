(function attachStorageService(globalScope) {
  function createStorage(hostBridge) {
    return {
      listNotes: () => hostBridge.notes.listNotes(),
      getNote: (id) => hostBridge.notes.getNote(id),
      createNote: (payload) => hostBridge.notes.createNote(payload),
      updateNote: (id, updates) => hostBridge.notes.updateNote(id, updates),
      deleteNote: (id) => hostBridge.notes.deleteNote(id),
      exportNotes: () => hostBridge.notes.exportNotes()
    };
  }

  const api = {
    createStorage
  };

  globalScope.FolioStorage = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
