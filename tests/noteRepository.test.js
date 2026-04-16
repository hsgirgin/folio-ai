const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createNoteRepository } = require('../lib/noteRepository');

module.exports = async function noteRepositoryTest() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-notes-'));
  const repository = createNoteRepository({ baseDir: tempDir });

  await repository.initialize();

  const section = await repository.createSection({ name: 'Projects' });
  const created = await repository.createNote({
    title: 'First note',
    content: '<p>Hello <strong>world</strong></p>',
    sectionId: section.id
  });

  assert.equal(created.title, 'First note');
  assert.equal(created.sectionId, section.id);

  const listed = await repository.listNotes();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, 'First note');
  assert.equal(listed[0].excerpt, 'Hello world');
  assert.equal(listed[0].sectionId, section.id);

  const updated = await repository.updateNote(created.id, {
    title: 'Renamed',
    content: '<p>Updated body with keyword</p>',
    sectionId: null
  });

  assert.equal(updated.title, 'Renamed');
  assert.equal(updated.sectionId, null);

  const fetched = await repository.getNote(created.id);
  assert.equal(fetched.content, '<p>Updated body with keyword</p>');
  assert.equal(fetched.sectionId, null);

  const exported = await repository.exportNotes();
  assert.equal(exported.length, 1);
  assert.equal(exported[0].id, created.id);
  assert.equal(exported[0].sectionId, null);

  const laterSection = await repository.createSection({ name: 'Reference' });
  await repository.updateNote(created.id, { sectionId: laterSection.id });
  await repository.deleteSection(laterSection.id);
  const afterSectionDelete = await repository.getNote(created.id);
  assert.equal(afterSectionDelete.sectionId, null);

  await repository.deleteNote(created.id);
  const afterDelete = await repository.listNotes();
  assert.equal(afterDelete.length, 0);

  const legacyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-legacy-'));
  await fs.mkdir(path.join(legacyDir, 'items'), { recursive: true });
  await fs.writeFile(path.join(legacyDir, 'index.json'), JSON.stringify({
    notes: [{
      id: 'legacy-note',
      title: 'Legacy',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      excerpt: 'legacy',
      searchText: 'legacy',
      folderId: 'legacy-folder'
    }],
    folders: [{
      id: 'legacy-folder',
      name: 'Legacy Section',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }]
  }, null, 2));
  await fs.writeFile(path.join(legacyDir, 'items', 'legacy-note.json'), JSON.stringify({
    id: 'legacy-note',
    title: 'Legacy',
    content: '<p>legacy body</p>',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    folderId: 'legacy-folder',
    tagIds: ['old-tag'],
    isPinned: true,
    isArchived: true
  }, null, 2));

  const legacyRepository = createNoteRepository({ baseDir: legacyDir });
  await legacyRepository.initialize();
  const legacyNote = await legacyRepository.getNote('legacy-note');
  const legacyMetadata = await legacyRepository.listNotes();
  const legacySections = await legacyRepository.listSections();

  assert.equal(legacyNote.sectionId, 'legacy-folder');
  assert.equal(legacyMetadata[0].sectionId, 'legacy-folder');
  assert.equal(legacySections[0].name, 'Legacy Section');

  await legacyRepository.updateNote('legacy-note', { title: 'Legacy Updated' });
  const rewrittenRaw = JSON.parse(await fs.readFile(path.join(legacyDir, 'items', 'legacy-note.json'), 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(rewrittenRaw, 'folderId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rewrittenRaw, 'tagIds'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rewrittenRaw, 'isPinned'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rewrittenRaw, 'isArchived'), false);
};
