const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createNoteRepository } = require('../lib/noteRepository');

module.exports = async function noteRepositoryTest() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-notes-'));
  const repository = createNoteRepository({ baseDir: tempDir });

  await repository.initialize();

  const created = await repository.createNote({
    title: 'First note',
    content: '<p>Hello <strong>world</strong></p>'
  });

  assert.equal(created.title, 'First note');

  const listed = await repository.listNotes();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, 'First note');
  assert.equal(listed[0].excerpt, 'Hello world');

  const updated = await repository.updateNote(created.id, {
    title: 'Renamed',
    content: '<p>Updated body with keyword</p>'
  });

  assert.equal(updated.title, 'Renamed');

  const fetched = await repository.getNote(created.id);
  assert.equal(fetched.content, '<p>Updated body with keyword</p>');

  const exported = await repository.exportNotes();
  assert.equal(exported.length, 1);
  assert.equal(exported[0].id, created.id);

  await repository.deleteNote(created.id);
  const afterDelete = await repository.listNotes();
  assert.equal(afterDelete.length, 0);
};
