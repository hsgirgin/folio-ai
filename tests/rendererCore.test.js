const assert = require('node:assert/strict');

const { sanitizeHtml, renderMarkdownToHtml } = require('../renderer/core/content');
const { normalizeSearchValue, noteMatchesSearch, noteMatchesSection, noteMatchesFilters } = require('../renderer/core/search');
const { normalizeUrl, getMarkdownShortcut } = require('../renderer/core/editorCommands');

module.exports = async function rendererCoreTest() {
  const dirty = '<p onclick="hack()">Hello</p><script>alert(1)</script><img src="javascript:evil()">';
  const cleaned = sanitizeHtml(dirty);

  assert.equal(cleaned.includes('onclick='), false);
  assert.equal(cleaned.includes('<script>'), false);
  assert.equal(cleaned.includes('javascript:'), false);

  const rendered = renderMarkdownToHtml('**hello**');
  assert.equal(typeof rendered, 'string');
  assert.equal(rendered.length > 0, true);

  const note = {
    title: 'Meeting notes',
    excerpt: 'Discuss roadmap and release plan',
    searchText: 'Discuss roadmap and release plan with dates',
    sectionId: 'section-1'
  };

  assert.equal(normalizeSearchValue('  RoadMap '), 'roadmap');
  assert.equal(noteMatchesSearch(note, 'roadmap'), true);
  assert.equal(noteMatchesSearch(note, 'missing'), false);

  assert.equal(noteMatchesSection(note, 'all'), true);
  assert.equal(noteMatchesSection(note, 'section-1'), true);
  assert.equal(noteMatchesSection(note, 'unsectioned'), false);
  assert.equal(noteMatchesSection({ ...note, sectionId: null }, 'unsectioned'), true);
  assert.equal(noteMatchesFilters(note, 'meeting', 'section-1'), true);
  assert.equal(noteMatchesFilters(note, 'meeting', 'unsectioned'), false);
  assert.equal(noteMatchesFilters(note, 'missing', 'section-1'), false);

  assert.equal(normalizeUrl('example.com'), 'https://example.com');
  assert.equal(normalizeUrl('javascript:alert(1)'), '');

  const shortcut = getMarkdownShortcut('#');
  assert.equal(shortcut.kind, 'h1');
  assert.equal(shortcut.triggerLength, 1);
  assert.equal(getMarkdownShortcut('plain text'), null);
};
