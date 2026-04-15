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

function sortByUpdatedAt(notes) {
  return [...notes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function createNoteRepository({ baseDir }) {
  const notesDir = path.join(baseDir, 'items');
  const indexPath = path.join(baseDir, INDEX_FILE);

  async function ensureStructure() {
    await fs.mkdir(notesDir, { recursive: true });
    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(indexPath, JSON.stringify({ notes: [] }, null, 2), 'utf8');
    }
  }

  async function readIndex() {
    await ensureStructure();
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.notes) ? parsed.notes : [];
  }

  async function writeIndex(notes) {
    await fs.writeFile(indexPath, JSON.stringify({ notes: sortByUpdatedAt(notes) }, null, 2), 'utf8');
  }

  function getNotePath(id) {
    return path.join(notesDir, `${id}${NOTE_FILE_SUFFIX}`);
  }

  async function writeNote(note) {
    await fs.writeFile(getNotePath(note.id), JSON.stringify(note, null, 2), 'utf8');
  }

  async function readNote(id) {
    const raw = await fs.readFile(getNotePath(id), 'utf8');
    return JSON.parse(raw);
  }

  return {
    async initialize() {
      await ensureStructure();
    },

    async listNotes() {
      return readIndex();
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
      const timestamp = new Date().toISOString();
      const note = {
        id: payload.id || randomUUID(),
        title: payload.title || '',
        content: payload.content || '',
        createdAt: payload.createdAt || timestamp,
        updatedAt: timestamp
      };

      await writeNote(note);

      const index = await readIndex();
      index.push(buildMetadata(note));
      await writeIndex(index);

      return note;
    },

    async updateNote(id, updates = {}) {
      const existing = await readNote(id);
      const note = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      };

      await writeNote(note);

      const index = await readIndex();
      const nextMetadata = buildMetadata(note);
      const nextIndex = index.map((entry) => (entry.id === id ? nextMetadata : entry));
      await writeIndex(nextIndex);

      return note;
    },

    async deleteNote(id) {
      const index = await readIndex();
      const nextIndex = index.filter((entry) => entry.id !== id);

      await fs.rm(getNotePath(id), { force: true });
      await writeIndex(nextIndex);

      return { deleted: true };
    },

    async exportNotes() {
      const index = await readIndex();
      const notes = await Promise.all(index.map((entry) => readNote(entry.id)));
      return notes;
    }
  };
}

module.exports = {
  createNoteRepository,
  buildMetadata,
  stripHtml
};
