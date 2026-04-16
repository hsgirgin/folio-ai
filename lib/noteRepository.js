const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const INDEX_FILE = 'index.json';
const NOTE_FILE_SUFFIX = '.json';

function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeNameKey(value) {
  return normalizeName(value).toLowerCase();
}

function normalizeSection(section = {}) {
  return {
    id: section.id || randomUUID(),
    name: normalizeName(section.name),
    createdAt: section.createdAt || new Date().toISOString(),
    updatedAt: section.updatedAt || section.createdAt || new Date().toISOString()
  };
}

function normalizeNote(note = {}) {
  return {
    id: note.id || randomUUID(),
    title: note.title || '',
    content: note.content || '',
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
    sectionId: note.sectionId || note.folderId || null
  };
}

function buildMetadata(note) {
  const normalized = normalizeNote(note);
  const plainText = stripHtml(normalized.content);
  return {
    id: normalized.id,
    title: normalized.title || '',
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    excerpt: plainText.slice(0, 180),
    searchText: plainText.slice(0, 5000),
    sectionId: normalized.sectionId
  };
}

function normalizeMetadata(note = {}) {
  return {
    id: note.id || randomUUID(),
    title: note.title || '',
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
    excerpt: note.excerpt || '',
    searchText: note.searchText || '',
    sectionId: note.sectionId || note.folderId || null
  };
}

function sortByUpdatedAt(items) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortByName(items) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeIndex(parsed = {}) {
  return {
    notes: Array.isArray(parsed.notes) ? sortByUpdatedAt(parsed.notes.map(normalizeMetadata)) : [],
    sections: Array.isArray(parsed.sections)
      ? sortByName(parsed.sections.map(normalizeSection))
      : Array.isArray(parsed.folders)
        ? sortByName(parsed.folders.map(normalizeSection))
        : []
  };
}

function createNameConflictError(entityName) {
  const error = new Error(`${entityName} name must be unique.`);
  error.code = 'NAME_CONFLICT';
  return error;
}

function createValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

function ensureUniqueName(items, nextName, entityName, currentId = null) {
  const normalized = normalizeName(nextName);
  if (!normalized) {
    throw createValidationError(`${entityName} name is required.`);
  }

  const nextKey = normalizeNameKey(normalized);
  const hasConflict = items.some((item) => item.id !== currentId && normalizeNameKey(item.name) === nextKey);
  if (hasConflict) {
    throw createNameConflictError(entityName);
  }

  return normalized;
}

function upsertMetadata(index, note) {
  const nextMetadata = buildMetadata(note);
  const existingIndex = index.notes.findIndex((entry) => entry.id === note.id);
  if (existingIndex >= 0) {
    index.notes.splice(existingIndex, 1, nextMetadata);
  } else {
    index.notes.push(nextMetadata);
  }
  index.notes = sortByUpdatedAt(index.notes);
}

function removeId(list, id) {
  return list.filter((entry) => entry.id !== id);
}

function createNoteRepository({ baseDir }) {
  const notesDir = path.join(baseDir, 'items');
  const indexPath = path.join(baseDir, INDEX_FILE);

  async function ensureStructure() {
    await fs.mkdir(notesDir, { recursive: true });
    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(indexPath, JSON.stringify({ notes: [], sections: [] }, null, 2), 'utf8');
    }
  }

  async function readIndex() {
    await ensureStructure();
    const raw = await fs.readFile(indexPath, 'utf8');
    return normalizeIndex(JSON.parse(raw));
  }

  async function writeIndex(index) {
    const normalized = normalizeIndex(index);
    await fs.writeFile(indexPath, JSON.stringify(normalized, null, 2), 'utf8');
  }

  function getNotePath(id) {
    return path.join(notesDir, `${id}${NOTE_FILE_SUFFIX}`);
  }

  async function writeNote(note) {
    await fs.writeFile(getNotePath(note.id), JSON.stringify(normalizeNote(note), null, 2), 'utf8');
  }

  async function readNote(id) {
    const raw = await fs.readFile(getNotePath(id), 'utf8');
    return normalizeNote(JSON.parse(raw));
  }

  async function listAllNotesFromFiles(index) {
    return Promise.all(index.notes.map((entry) => readNote(entry.id)));
  }

  async function updateManyNotes(notes) {
    await Promise.all(notes.map((note) => writeNote(note)));
  }

  function validateNoteReferences(index, updates = {}) {
    if (Object.prototype.hasOwnProperty.call(updates, 'sectionId')) {
      const { sectionId } = updates;
      if (sectionId && !index.sections.some((section) => section.id === sectionId)) {
        throw createValidationError('Selected section does not exist.');
      }
    }
  }

  return {
    async initialize() {
      await ensureStructure();
      const index = await readIndex();
      await writeIndex(index);
    },

    async listNotes() {
      const index = await readIndex();
      return index.notes;
    },

    async getNote(id) {
      if (!id) {
        return null;
      }

      try {
        return await readNote(id);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async createNote(payload = {}) {
      const index = await readIndex();
      validateNoteReferences(index, payload);
      const timestamp = new Date().toISOString();
      const note = normalizeNote({
        id: payload.id || randomUUID(),
        title: payload.title || '',
        content: payload.content || '',
        createdAt: payload.createdAt || timestamp,
        updatedAt: timestamp,
        sectionId: payload.sectionId || null
      });

      await writeNote(note);
      upsertMetadata(index, note);
      await writeIndex(index);
      return note;
    },

    async updateNote(id, updates = {}) {
      const index = await readIndex();
      validateNoteReferences(index, updates);
      const existing = await readNote(id);
      const note = normalizeNote({
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      });

      await writeNote(note);
      upsertMetadata(index, note);
      await writeIndex(index);
      return note;
    },

    async deleteNote(id) {
      const index = await readIndex();
      index.notes = removeId(index.notes, id);
      await fs.rm(getNotePath(id), { force: true });
      await writeIndex(index);
      return { deleted: true };
    },

    async exportNotes() {
      const index = await readIndex();
      return sortByUpdatedAt(await listAllNotesFromFiles(index));
    },

    async listSections() {
      const index = await readIndex();
      return index.sections;
    },

    async createSection(payload = {}) {
      const index = await readIndex();
      const timestamp = new Date().toISOString();
      const section = normalizeSection({
        id: payload.id || randomUUID(),
        name: ensureUniqueName(index.sections, payload.name, 'Section'),
        createdAt: payload.createdAt || timestamp,
        updatedAt: timestamp
      });

      index.sections.push(section);
      index.sections = sortByName(index.sections);
      await writeIndex(index);
      return section;
    },

    async updateSection(id, updates = {}) {
      const index = await readIndex();
      const section = index.sections.find((entry) => entry.id === id);
      if (!section) {
        throw createValidationError('Section not found.');
      }

      section.name = ensureUniqueName(index.sections, updates.name, 'Section', id);
      section.updatedAt = new Date().toISOString();
      index.sections = sortByName(index.sections);
      await writeIndex(index);
      return section;
    },

    async deleteSection(id) {
      const index = await readIndex();
      const section = index.sections.find((entry) => entry.id === id);
      if (!section) {
        return { deleted: true };
      }

      const now = new Date().toISOString();
      const notes = await listAllNotesFromFiles(index);
      const nextNotes = notes.map((note) => (
        note.sectionId === id
          ? { ...note, sectionId: null, updatedAt: now }
          : note
      ));

      await updateManyNotes(nextNotes);
      index.sections = removeId(index.sections, id);
      index.notes = nextNotes.map(buildMetadata);
      await writeIndex(index);
      return { deleted: true };
    }
  };
}

module.exports = {
  createNoteRepository,
  buildMetadata,
  stripHtml,
  normalizeNote
};
