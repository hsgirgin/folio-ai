(function attachBrowserBridge(globalScope) {
  const STORAGE_KEY = 'folio-browser-notes-v4';

  function stripHtml(html) {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeName(value) {
    return String(value || '').trim();
  }

  function normalizeNameKey(value) {
    return normalizeName(value).toLowerCase();
  }

  function normalizeSection(section) {
    return {
      id: section.id,
      name: normalizeName(section.name),
      createdAt: section.createdAt,
      updatedAt: section.updatedAt
    };
  }

  function normalizeNote(note) {
    return {
      id: note.id,
      title: note.title || '',
      content: note.content || '',
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      sectionId: note.sectionId || note.folderId || null
    };
  }

  function buildMetadata(note) {
    const plainText = stripHtml(note.content);
    return {
      id: note.id,
      title: note.title || '',
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      excerpt: plainText.slice(0, 180),
      searchText: plainText.slice(0, 5000),
      sectionId: note.sectionId || null
    };
  }

  function loadState() {
    const raw = globalScope.localStorage.getItem(STORAGE_KEY)
      || globalScope.localStorage.getItem('folio-browser-notes-v3')
      || globalScope.localStorage.getItem('folio-browser-notes-v2');

    if (!raw) {
      return { notes: {}, sections: {} };
    }

    try {
      const parsed = JSON.parse(raw);
      const notes = parsed?.notes && typeof parsed.notes === 'object' ? parsed.notes : {};
      const sectionsSource = parsed?.sections && typeof parsed.sections === 'object'
        ? parsed.sections
        : parsed?.folders && typeof parsed.folders === 'object'
          ? parsed.folders
          : {};
      return { notes, sections: sectionsSource };
    } catch {
      return { notes: {}, sections: {} };
    }
  }

  function saveState(state) {
    globalScope.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function sortByUpdatedAt(items) {
    return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  function sortByName(items) {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
  }

  function ensureUniqueName(items, name, entityName, currentId = null) {
    const normalized = normalizeName(name);
    if (!normalized) {
      throw new Error(`${entityName} name is required.`);
    }
    const nextKey = normalizeNameKey(normalized);
    const hasConflict = items.some((item) => item.id !== currentId && normalizeNameKey(item.name) === nextKey);
    if (hasConflict) {
      throw new Error(`${entityName} name must be unique.`);
    }
    return normalized;
  }

  function validateReferences(state, updates = {}) {
    if (Object.prototype.hasOwnProperty.call(updates, 'sectionId')) {
      const { sectionId } = updates;
      if (sectionId && !state.sections[sectionId]) {
        throw new Error('Selected section does not exist.');
      }
    }
  }

  const api = {
    async listNotes() {
      return sortByUpdatedAt(Object.values(loadState().notes).map(normalizeNote).map(buildMetadata));
    },

    async getNote(id) {
      const note = loadState().notes[id];
      return note ? normalizeNote(note) : null;
    },

    async createNote(payload = {}) {
      const state = loadState();
      validateReferences(state, payload);
      const timestamp = new Date().toISOString();
      const note = normalizeNote({
        id: payload.id || `browser-${Date.now()}`,
        title: payload.title || '',
        content: payload.content || '',
        createdAt: payload.createdAt || timestamp,
        updatedAt: timestamp,
        sectionId: payload.sectionId || null
      });
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
      validateReferences(state, updates);
      const note = normalizeNote({
        ...existing,
        ...updates,
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      });
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
      return sortByUpdatedAt(Object.values(loadState().notes).map(normalizeNote));
    },

    async listSections() {
      return sortByName(Object.values(loadState().sections).map(normalizeSection));
    },

    async createSection(payload = {}) {
      const state = loadState();
      const timestamp = new Date().toISOString();
      const sections = Object.values(state.sections).map(normalizeSection);
      const section = normalizeSection({
        id: payload.id || `section-${Date.now()}`,
        name: ensureUniqueName(sections, payload.name, 'Section'),
        createdAt: payload.createdAt || timestamp,
        updatedAt: timestamp
      });
      state.sections[section.id] = section;
      saveState(state);
      return section;
    },

    async updateSection(id, updates = {}) {
      const state = loadState();
      const existing = state.sections[id];
      if (!existing) {
        throw new Error('Section not found.');
      }
      const sections = Object.values(state.sections).map(normalizeSection);
      const section = normalizeSection({
        ...existing,
        name: ensureUniqueName(sections, updates.name, 'Section', id),
        updatedAt: new Date().toISOString()
      });
      state.sections[id] = section;
      saveState(state);
      return section;
    },

    async deleteSection(id) {
      const state = loadState();
      delete state.sections[id];
      const now = new Date().toISOString();
      Object.keys(state.notes).forEach((noteId) => {
        const note = normalizeNote(state.notes[noteId]);
        if (note.sectionId === id) {
          state.notes[noteId] = { ...note, sectionId: null, updatedAt: now };
        }
      });
      saveState(state);
      return { deleted: true };
    }
  };

  globalScope.FolioBrowserNotesBridge = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
