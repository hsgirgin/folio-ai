(function attachBrowserBridge(globalScope) {
  const STORAGE_KEY = 'folio-browser-notes-v2';

  function stripHtml(html) {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildMetadata(note) {
    const plainText = stripHtml(note.content);
    return {
      id: note.id,
      title: note.title || '',
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      excerpt: plainText.slice(0, 180),
      searchText: plainText.slice(0, 5000)
    };
  }

  function loadState() {
    const raw = globalScope.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { notes: {} };
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : { notes: {} };
    } catch {
      return { notes: {} };
    }
  }

  function saveState(state) {
    globalScope.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function listMetadata(state) {
    return Object.values(state.notes)
      .map(buildMetadata)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  const api = {
    async listNotes() {
      return listMetadata(loadState());
    },

    async getNote(id) {
      const state = loadState();
      return state.notes[id] || null;
    },

    async createNote(payload = {}) {
      const state = loadState();
      const timestamp = new Date().toISOString();
      const note = {
        id: payload.id || `browser-${Date.now()}`,
        title: payload.title || '',
        content: payload.content || '',
        createdAt: payload.createdAt || timestamp,
        updatedAt: timestamp
      };

      state.notes[note.id] = note;
      saveState(state);
      return note;
    },

    async updateNote(id, updates = {}) {
      const state = loadState();
      const existing = state.notes[id];
      if (!existing) {
        throw new Error(`Note not found: ${id}`);
      }

      const note = {
        ...existing,
        ...updates,
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      };

      state.notes[id] = note;
      saveState(state);
      return note;
    },

    async deleteNote(id) {
      const state = loadState();
      delete state.notes[id];
      saveState(state);
      return { deleted: true };
    },

    async exportNotes() {
      return Object.values(loadState().notes);
    }
  };

  globalScope.FolioBrowserNotesBridge = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
