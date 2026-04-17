const { sanitizeHtml, renderMarkdownToHtml } = window.FolioContent;
const { normalizeSearchValue, noteMatchesFilters } = window.FolioSearch;
const { BLOCK_TAGS, normalizeUrl, getMarkdownShortcut } = window.FolioEditorCommands;

const hostBridge = window.FolioHostBridge.createBridge(window.folioAPI);
const storage = window.FolioStorage.createStorage(hostBridge);
const aiProvider = window.FolioAI.createAIProvider({ hostBridge });
const THEME_STORAGE_KEY = 'folio-theme-mode';
const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

marked.setOptions({ breaks: true, gfm: true });

const state = {
  notes: [],
  sections: [],
  currentNoteId: null,
  currentNote: null,
  selectedSectionId: 'all',
  searchQuery: '',
  saveTimeout: null,
  lastRange: null,
  lastAiResult: '',
  historyStack: [],
  sectionEditor: {
    mode: 'create',
    sectionId: null
  },
  pendingDelete: {
    type: null,
    targetId: null,
    label: ''
  },
  contextMenu: {
    visible: false,
    type: null,
    targetId: null,
    primaryAction: null
  },
  themeMode: localStorage.getItem(THEME_STORAGE_KEY) || 'system'
};

function getThemeButtonLabel(mode) {
  if (mode === 'dark') {
    return 'Theme: Dark';
  }

  if (mode === 'light') {
    return 'Theme: Light';
  }

  return 'Theme: Auto';
}

function applyTheme(mode = state.themeMode) {
  state.themeMode = mode;
  const root = document.documentElement;
  if (mode === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = mode;
  }

  const themeToggleButton = document.getElementById('themeToggleBtn');
  if (themeToggleButton) {
    themeToggleButton.textContent = getThemeButtonLabel(mode);
    themeToggleButton.setAttribute('aria-label', `Color mode ${mode}`);
  }
}

function cycleThemeMode() {
  const nextMode = state.themeMode === 'system'
    ? 'dark'
    : state.themeMode === 'dark'
      ? 'light'
      : 'system';

  localStorage.setItem(THEME_STORAGE_KEY, nextMode);
  applyTheme(nextMode);
  showTransientStatus(`Theme set to ${nextMode}`);
}

function getEditor() {
  return document.getElementById('content');
}

function getTitleInput() {
  return document.getElementById('title');
}

function getSafeRange() {
  const selection = window.getSelection();
  if (selection.rangeCount && isSelectionInsideEditor()) {
    return selection.getRangeAt(0);
  }

  if (state.lastRange) {
    selection.removeAllRanges();
    selection.addRange(state.lastRange);
    return state.lastRange;
  }

  return null;
}

function captureSelection() {
  const range = getSafeRange();
  if (range) {
    state.lastRange = range.cloneRange();
  }
}

function isSelectionInsideEditor() {
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;

  return Boolean(ancestor?.closest('#content'));
}

function focusEditor() {
  getEditor().focus();
}

function setStatus(message = '', isError = false) {
  const overlay = document.getElementById('statusOverlay');
  overlay.textContent = message;
  overlay.style.display = message ? 'block' : 'none';
  overlay.dataset.variant = isError ? 'error' : 'info';
}

function clearStatus() {
  setStatus('');
}

function openAiPanel({ focusInput = true } = {}) {
  const panel = document.getElementById('aiPanel');
  document.getElementById('floatingAI').style.display = 'none';
  panel.classList.remove('closed');
  if (focusInput) {
    document.getElementById('sidebarChatInput')?.focus();
  }
}

function toggleAiPanel() {
  const panel = document.getElementById('aiPanel');
  const willOpen = panel.classList.contains('closed');
  panel.classList.toggle('closed');
  if (willOpen) {
    openAiPanel();
  }
}

function showTransientStatus(message, isError = false) {
  setStatus(message, isError);
  clearTimeout(state.statusTimer);
  state.statusTimer = window.setTimeout(() => setStatus(''), isError ? 2600 : 1800);
}

function setAiError(message) {
  const area = document.getElementById('replacementArea');
  const text = document.getElementById('replacementText');
  area.style.display = 'block';
  text.textContent = message;
  setStatus(message, true);
}

function insertHtmlAtRange(range, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content.cloneNode(true);
  const lastNode = fragment.lastChild;

  range.deleteContents();
  range.insertNode(fragment);

  const selection = window.getSelection();
  const nextRange = document.createRange();
  if (lastNode?.parentNode) {
    nextRange.setStartAfter(lastNode);
  } else {
    nextRange.selectNodeContents(getEditor());
  }
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function insertHtmlAtCursor(html) {
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;

  if (!ancestor?.closest('#content')) {
    return false;
  }

  insertHtmlAtRange(range, html);
  return true;
}

function setCaretAtStart(element) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  captureSelection();
}

function findClosestElement(node, selector) {
  if (!node) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element?.closest(selector) || null;
}

function getCurrentBlockElement() {
  const range = getSafeRange();
  if (!range) {
    return null;
  }

  const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;

  return startNode?.closest(BLOCK_TAGS.join(',')) || getEditor();
}

function unwrapElement(element) {
  const parent = element.parentNode;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function takeSnapshot() {
  const content = getEditor().innerHTML;
  if (state.historyStack[state.historyStack.length - 1] !== content) {
    state.historyStack.push(content);
    if (state.historyStack.length > 50) {
      state.historyStack.shift();
    }
  }
}

function removeCharactersBeforeCaret(count) {
  const range = getSafeRange();
  if (!range || !range.collapsed) {
    return false;
  }

  const workingRange = range.cloneRange();
  let currentNode = workingRange.startContainer;
  let currentOffset = workingRange.startOffset;

  if (currentNode.nodeType !== Node.TEXT_NODE) {
    if (!currentNode.childNodes.length) {
      return false;
    }
    currentNode = currentNode.childNodes[Math.max(0, currentOffset - 1)] || currentNode.childNodes[0];
    while (currentNode && currentNode.nodeType !== Node.TEXT_NODE && currentNode.lastChild) {
      currentNode = currentNode.lastChild;
    }
    currentOffset = currentNode?.textContent?.length || 0;
  }

  if (!currentNode || currentNode.nodeType !== Node.TEXT_NODE || currentOffset < count) {
    return false;
  }

  workingRange.setStart(currentNode, currentOffset - count);
  workingRange.deleteContents();
  captureSelection();
  return true;
}

function runEditorCommand(command, value = null) {
  const range = getSafeRange();
  if (!range) {
    return false;
  }

  takeSnapshot();
  focusEditor();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const result = document.execCommand(command, false, value);
  if (result) {
    saveCurrentNote(true);
  }
  return result;
}

function formatBlock(tagName) {
  const block = getCurrentBlockElement();
  if (!block || block === getEditor()) {
    return false;
  }

  if (block.tagName === tagName.toUpperCase()) {
    return runEditorCommand('formatBlock', 'P');
  }

  return runEditorCommand('formatBlock', tagName);
}

function insertChecklist() {
  const block = getCurrentBlockElement();
  if (!block || block === getEditor()) {
    return false;
  }

  takeSnapshot();
  const checklist = document.createElement('ul');
  checklist.dataset.list = 'checklist';
  const listItem = document.createElement('li');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.setAttribute('contenteditable', 'false');
  checkbox.tabIndex = 0;
  const text = document.createElement('span');
  text.innerHTML = block.innerHTML || '<br>';
  listItem.append(checkbox, text);
  checklist.appendChild(listItem);
  block.replaceWith(checklist);
  setCaretAtStart(text);
  saveCurrentNote(true);
  return true;
}

function applyMarkdownShortcut(shortcut) {
  removeCharactersBeforeCaret(shortcut.triggerLength);
  switch (shortcut.kind) {
    case 'h1': return formatBlock('H1');
    case 'h2': return formatBlock('H2');
    case 'ul': return runEditorCommand('insertUnorderedList');
    case 'ol': return runEditorCommand('insertOrderedList');
    case 'blockquote': return formatBlock('BLOCKQUOTE');
    case 'checklist': return insertChecklist();
    default: return false;
  }
}

function maybeApplyMarkdownShortcut(event) {
  if (event.key !== ' ' || !isSelectionInsideEditor()) {
    return false;
  }

  const range = getSafeRange();
  if (!range || !range.collapsed) {
    return false;
  }

  const block = getCurrentBlockElement();
  if (!block || block === getEditor()) {
    return false;
  }

  const prefixRange = range.cloneRange();
  prefixRange.selectNodeContents(block);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const shortcut = getMarkdownShortcut(prefixRange.toString());

  if (!shortcut) {
    return false;
  }

  event.preventDefault();
  return applyMarkdownShortcut(shortcut);
}

function insertLink() {
  const range = getSafeRange();
  if (!range) {
    return false;
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  if (!selection.toString().trim()) {
    return false;
  }
  const url = normalizeUrl(window.prompt('Enter a URL'));
  if (!url) {
    return false;
  }
  return runEditorCommand('createLink', url);
}

function removeLink() {
  const range = getSafeRange();
  if (!range) {
    return false;
  }
  const anchor = findClosestElement(range.startContainer, 'a');
  if (!anchor) {
    return false;
  }
  takeSnapshot();
  unwrapElement(anchor);
  saveCurrentNote(true);
  return true;
}

function getCurrentSectionLabel() {
  if (state.selectedSectionId === 'all') {
    return 'All Pages';
  }
  if (state.selectedSectionId === null || state.selectedSectionId === 'unsectioned') {
    return 'Unsectioned';
  }
  return state.sections.find((section) => section.id === state.selectedSectionId)?.name || 'Section';
}

function getCurrentNoteMetadata() {
  return state.notes.find((note) => note.id === state.currentNoteId) || null;
}

function getSectionById(sectionId) {
  return state.sections.find((section) => section.id === sectionId) || null;
}

function getNoteById(noteId) {
  return state.notes.find((note) => note.id === noteId) || null;
}

function closeContextMenu() {
  const menu = document.getElementById('itemContextMenu');
  const primaryButton = document.getElementById('contextPrimaryBtn');
  const divider = document.getElementById('contextMenuDivider');
  menu.classList.remove('active');
  if (primaryButton) {
    primaryButton.hidden = true;
    primaryButton.textContent = '';
  }
  if (divider) {
    divider.hidden = true;
  }
  state.contextMenu = {
    visible: false,
    type: null,
    targetId: null,
    primaryAction: null
  };
}

function clearPendingDelete() {
  state.pendingDelete = {
    type: null,
    targetId: null,
    label: ''
  };
  const banner = document.getElementById('deleteBanner');
  const text = document.getElementById('deleteBannerText');
  banner.classList.remove('active');
  text.textContent = '';
}

function requestDelete(type, targetId, label) {
  state.pendingDelete = {
    type,
    targetId,
    label
  };
  const banner = document.getElementById('deleteBanner');
  const text = document.getElementById('deleteBannerText');
  text.textContent = type === 'section'
    ? `Delete section "${label}"? Pages will move to Unsectioned.`
    : `Delete page "${label}"?`;
  banner.classList.add('active');
}

function openContextMenu(event, type, targetId) {
  event.preventDefault();
  const menu = document.getElementById('itemContextMenu');
  const primaryButton = document.getElementById('contextPrimaryBtn');
  const divider = document.getElementById('contextMenuDivider');
  const renameButton = document.getElementById('contextRenameBtn');
  const deleteButton = document.getElementById('contextDeleteBtn');
  let primaryAction = null;

  primaryButton.hidden = true;
  primaryButton.textContent = '';
  divider.hidden = true;

  if (type === 'section') {
    primaryButton.textContent = 'New Page In Section';
    primaryButton.hidden = false;
    divider.hidden = false;
    primaryAction = 'new-page-in-section';
  }

  renameButton.textContent = type === 'section' ? 'Rename Section' : 'Rename Page';
  deleteButton.textContent = type === 'section' ? 'Delete Section' : 'Delete Page';

  state.contextMenu = {
    visible: true,
    type,
    targetId,
    primaryAction
  };

  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.classList.add('active');
}

function getFilteredNotes() {
  return state.notes.filter((note) => noteMatchesFilters(note, state.searchQuery, state.selectedSectionId));
}

function syncSelectedSection() {
  if (state.selectedSectionId === 'all' || state.selectedSectionId === null || state.selectedSectionId === 'unsectioned') {
    return;
  }
  if (!state.sections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = 'all';
  }
}

async function refreshCollections() {
  const [notes, sections] = await Promise.all([
    storage.listNotes(),
    storage.listSections()
  ]);
  state.notes = notes;
  state.sections = sections;
  syncSelectedSection();
  renderSections();
  renderPages();
  renderHeaderControls();
}

function renderSections() {
  const list = document.getElementById('sectionsList');
  list.innerHTML = '';

  [
    { id: 'all', name: 'All Pages' },
    { id: 'unsectioned', name: 'Unsectioned' }
  ].forEach((section) => {
    list.appendChild(createSectionItem(section, false));
  });

  state.sections.forEach((section) => {
    list.appendChild(createSectionItem(section, true));
  });
}

function createSectionItem(section, editable) {
  const row = document.createElement('div');
  row.className = 'section-row';
  if (editable) {
    row.addEventListener('contextmenu', (event) => openContextMenu(event, 'section', section.id));
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `section-button ${state.selectedSectionId === section.id ? 'active' : ''}`;
  button.textContent = section.name;
  button.addEventListener('click', () => {
    state.selectedSectionId = section.id;
    renderSections();
    renderPages();
  });
  row.appendChild(button);

  return row;
}

function renderPages() {
  const list = document.getElementById('pagesList');
  const title = document.getElementById('pagesPaneTitle');
  const emptyState = document.getElementById('pagesEmptyState');
  const filteredNotes = getFilteredNotes();

  title.textContent = getCurrentSectionLabel();
  list.innerHTML = '';
  emptyState.style.display = filteredNotes.length ? 'none' : 'block';

  filteredNotes.forEach((note) => {
    const item = document.createElement('div');
    item.className = `page-item ${note.id === state.currentNoteId ? 'active' : ''}`;
    item.addEventListener('click', () => openNote(note.id));
    item.addEventListener('contextmenu', (event) => openContextMenu(event, 'page', note.id));

    const textShell = document.createElement('div');
    textShell.className = 'page-item-body';

    const name = document.createElement('div');
    name.className = 'page-title';
    name.textContent = note.title || 'Untitled';

    const excerpt = document.createElement('div');
    excerpt.className = 'page-excerpt';
    excerpt.textContent = note.excerpt || 'Empty page';

    textShell.append(name, excerpt);

    item.append(textShell);
    list.appendChild(item);
  });
}

function renderHeaderControls() {
  const select = document.getElementById('sectionSelect');
  if (!select) {
    return;
  }
  const current = state.currentNote || getCurrentNoteMetadata();
  select.innerHTML = '';

  const unsectionedOption = document.createElement('option');
  unsectionedOption.value = '';
  unsectionedOption.textContent = 'Unsectioned';
  select.appendChild(unsectionedOption);

  state.sections.forEach((section) => {
    const option = document.createElement('option');
    option.value = section.id;
    option.textContent = section.name;
    select.appendChild(option);
  });

  select.disabled = !current;
  select.value = current?.sectionId || '';
}

async function persistCurrentNoteNow() {
  if (!state.currentNoteId) {
    return;
  }

  const updated = await storage.updateNote(state.currentNoteId, {
    title: getTitleInput().value,
    content: getEditor().innerHTML
  });
  state.currentNote = updated;
  await refreshCollections();
}

async function flushPendingSave() {
  if (!state.saveTimeout) {
    return;
  }

  clearTimeout(state.saveTimeout);
  state.saveTimeout = null;
  await persistCurrentNoteNow();
}

function saveCurrentNote(skipSnapshot = false) {
  if (!state.currentNoteId) {
    return;
  }

  if (!skipSnapshot) {
    takeSnapshot();
  }

  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(async () => {
    state.saveTimeout = null;
    await persistCurrentNoteNow();
  }, 250);
}

async function openNote(id) {
  await flushPendingSave();
  const note = await storage.getNote(id);
  if (!note) {
    return;
  }

  state.currentNoteId = id;
  state.currentNote = note;
  getTitleInput().value = note.title || '';
  getEditor().innerHTML = note.content || '';
  document.getElementById('chatHistory').innerHTML = '';
  document.getElementById('replacementArea').style.display = 'none';
  state.historyStack = [note.content || ''];
  renderPages();
  renderHeaderControls();
}

function getNewNoteDefaults() {
  return {
    title: '',
    content: '',
    sectionId: state.selectedSectionId === 'all' || state.selectedSectionId === 'unsectioned'
      ? null
      : state.selectedSectionId
  };
}

async function newNote() {
  await flushPendingSave();
  const note = await storage.createNote(getNewNoteDefaults());
  await refreshCollections();
  await openNote(note.id);
  focusEditor();
}

async function newNoteInSection(sectionId) {
  await flushPendingSave();
  const note = await storage.createNote({
    title: '',
    content: '',
    sectionId: sectionId || null
  });
  await refreshCollections();
  await openNote(note.id);
  focusEditor();
}

function getFallbackNoteId() {
  return getFilteredNotes()[0]?.id || state.notes[0]?.id || null;
}

async function deleteNote(event, id) {
  event.stopPropagation();
  closeContextMenu();
  const note = getNoteById(id);
  requestDelete('page', id, note?.title || 'Untitled');
}

async function createSection() {
  const input = document.getElementById('sectionNameInput');
  const label = document.getElementById('sectionCreatorLabel');
  const name = input.value.trim();
  if (!name) {
    showTransientStatus('Section name is required.', true);
    input.focus();
    return;
  }
  try {
    let section = null;
    if (state.sectionEditor.mode === 'rename' && state.sectionEditor.sectionId) {
      section = await storage.updateSection(state.sectionEditor.sectionId, { name });
      showTransientStatus('Section renamed');
    } else {
      section = await storage.createSection({ name });
      showTransientStatus(`Created section "${section.name}"`);
    }
    closeSectionCreator();
    input.value = '';
    await refreshCollections();
    state.selectedSectionId = section.id;
    renderSections();
    renderPages();
    label.textContent = 'Create section';
  } catch (error) {
    showTransientStatus(error.message || 'Unable to create section.', true);
  }
}

function openSectionCreator(section = null) {
  const creator = document.getElementById('sectionCreator');
  const input = document.getElementById('sectionNameInput');
  const label = document.getElementById('sectionCreatorLabel');
  const saveButton = document.getElementById('saveSectionBtn');

  state.sectionEditor = {
    mode: section ? 'rename' : 'create',
    sectionId: section?.id || null
  };

  creator.classList.add('active');
  input.value = section?.name || '';
  label.textContent = section ? 'Rename section' : 'Create section';
  saveButton.textContent = section ? 'Rename' : 'Create';
  input.focus();
  input.select();
}

function closeSectionCreator() {
  const creator = document.getElementById('sectionCreator');
  const input = document.getElementById('sectionNameInput');
  const label = document.getElementById('sectionCreatorLabel');
  const saveButton = document.getElementById('saveSectionBtn');

  state.sectionEditor = {
    mode: 'create',
    sectionId: null
  };

  creator.classList.remove('active');
  input.value = '';
  label.textContent = 'Create section';
  saveButton.textContent = 'Create';
}

async function renameSection(section) {
  openSectionCreator(section);
}

async function deleteSection(section) {
  await flushPendingSave();
  try {
    await storage.deleteSection(section.id);
    const currentNoteWasInSection = state.currentNote?.sectionId === section.id;
    if (state.selectedSectionId === section.id) {
      state.selectedSectionId = 'all';
    }
    await refreshCollections();
    if (currentNoteWasInSection && state.currentNoteId) {
      const refreshedCurrentNote = await storage.getNote(state.currentNoteId);
      if (refreshedCurrentNote) {
        state.currentNote = refreshedCurrentNote;
        getTitleInput().value = refreshedCurrentNote.title || '';
        getEditor().innerHTML = refreshedCurrentNote.content || '';
        state.historyStack = [refreshedCurrentNote.content || ''];
      }
    }
    renderSections();
    renderPages();
    renderHeaderControls();
    clearPendingDelete();
    focusEditor();
    showTransientStatus('Section deleted');
  } catch (error) {
    showTransientStatus(error.message || 'Unable to delete section.', true);
  }
}

async function deleteNoteById(id) {
  await flushPendingSave();
  await storage.deleteNote(id);
  await refreshCollections();
  clearPendingDelete();

  if (id === state.currentNoteId) {
    const nextId = getFallbackNoteId();
    if (nextId) {
      await openNote(nextId);
    } else {
      state.currentNoteId = null;
      state.currentNote = null;
      await newNote();
    }
    return;
  }

  renderPages();
  renderHeaderControls();
}

async function confirmPendingDelete() {
  const { type, targetId } = state.pendingDelete;
  if (!type || !targetId) {
    return;
  }

  if (type === 'section') {
    const section = getSectionById(targetId);
    if (section) {
      await deleteSection(section);
    } else {
      clearPendingDelete();
    }
    return;
  }

  if (type === 'page') {
    await deleteNoteById(targetId);
  }
}

async function renamePage(pageId) {
  if (pageId !== state.currentNoteId) {
    await openNote(pageId);
  }
  const titleInput = getTitleInput();
  titleInput.focus();
  titleInput.select();
}

async function moveCurrentNoteToSection(sectionId) {
  if (!state.currentNoteId) {
    return;
  }
  try {
    await flushPendingSave();
    const updated = await storage.updateNote(state.currentNoteId, {
      sectionId: sectionId || null
    });
    state.currentNote = updated;
    await refreshCollections();
    renderPages();
    renderHeaderControls();
    showTransientStatus('Page moved');
  } catch (error) {
    showTransientStatus(error.message || 'Unable to move page.', true);
  }
}

function renderAiControls() {
  document.getElementById('providerName').textContent = aiProvider.getProviderLabel();
  const presetSelect = document.getElementById('modelPreset');
  presetSelect.innerHTML = '';
  aiProvider.getModelPresets().forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    if (preset.id === aiProvider.getActivePresetId()) {
      option.selected = true;
    }
    presetSelect.appendChild(option);
  });
  presetSelect.onchange = (event) => {
    aiProvider.setActivePresetId(event.target.value);
    const preset = aiProvider.getActivePreset();
    showTransientStatus(`Selected ${preset.label} (${preset.model})`);
  };
}

async function ensureAiReady() {
  try {
    const available = await aiProvider.isAvailable();
    if (!available) {
      setAiError(`${aiProvider.getProviderLabel()} is offline. Start it or switch providers to use AI features.`);
      return false;
    }
    await aiProvider.ensureModelReady();
    return true;
  } catch (error) {
    setAiError(error.message || 'Unable to reach the selected AI provider.');
    return false;
  }
}

async function runAiRewrite(action) {
  const selectedText = state.lastRange ? state.lastRange.toString().trim() : '';
  if (!selectedText) {
    setAiError('Select some text before running an AI rewrite.');
    return;
  }

  const instruction = action === 'custom'
    ? document.getElementById('customPrompt').value.trim()
    : action === 'simplify'
      ? 'Rewrite this to be simpler.'
      : 'Fix grammar and spelling.';

  if (!instruction) {
    setAiError('Add an instruction before asking AI to rewrite.');
    return;
  }

  clearStatus();
  openAiPanel({ focusInput: false });
  if (!(await ensureAiReady())) {
    return;
  }

  const area = document.getElementById('replacementArea');
  const text = document.getElementById('replacementText');
  area.style.display = 'block';
  text.innerHTML = '<em>Thinking...</em>';
  state.lastAiResult = '';

  try {
    await aiProvider.rewriteSelection(instruction, selectedText, (partial) => {
      state.lastAiResult = partial;
      text.innerHTML = marked.parse(partial);
    });
    clearStatus();
  } catch (error) {
    setStatus(error.message || 'Error calling AI.', true);
    text.textContent = error.message || 'Error calling AI.';
  }
}

async function runAiChat() {
  const input = document.getElementById('sidebarChatInput');
  const query = input.value.trim();
  if (!query) {
    return;
  }

  clearStatus();
  openAiPanel();
  if (!(await ensureAiReady())) {
    return;
  }

  const history = document.getElementById('chatHistory');
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user-msg';
  userBubble.textContent = query;
  history.prepend(userBubble);
  input.value = '';

  const aiBubble = document.createElement('div');
  aiBubble.className = 'chat-bubble';
  aiBubble.innerHTML = '<em>Thinking...</em>';
  history.prepend(aiBubble);

  try {
    await aiProvider.chat(getEditor().innerText, query, (partial) => {
      aiBubble.innerHTML = marked.parse(partial);
    });
    clearStatus();
  } catch (error) {
    setStatus(error.message || 'AI Offline.', true);
    aiBubble.textContent = error.message || 'AI Offline.';
  }
}

window.formatSelection = (type) => {
  const actions = {
    bold: () => runEditorCommand('bold'),
    italic: () => runEditorCommand('italic'),
    h1: () => formatBlock('H1'),
    h2: () => formatBlock('H2'),
    bullet: () => runEditorCommand('insertUnorderedList'),
    number: () => runEditorCommand('insertOrderedList'),
    checklist: () => insertChecklist(),
    quote: () => formatBlock('BLOCKQUOTE'),
    link: () => insertLink(),
    unlink: () => removeLink()
  };
  const action = actions[type];
  if (action) {
    action();
  }
};

window.toggleNavigation = () => document.getElementById('navigationShell').classList.toggle('collapsed');
window.toggleAI = toggleAiPanel;
window.updateSearch = (value) => {
  state.searchQuery = normalizeSearchValue(value);
  renderPages();
};
window.clearSearch = () => {
  const input = document.getElementById('searchInput');
  state.searchQuery = '';
  if (input) {
    input.value = '';
  }
  renderPages();
};
window.aiContextual = runAiRewrite;
window.aiChat = runAiChat;
window.applyReplacement = () => {
  if (!state.lastRange || !state.lastAiResult) {
    return;
  }
  takeSnapshot();
  const renderedHtml = renderMarkdownToHtml(state.lastAiResult) || `<p>${state.lastAiResult}</p>`;
  insertHtmlAtRange(state.lastRange, renderedHtml);
  document.getElementById('replacementArea').style.display = 'none';
  saveCurrentNote(true);
};
window.newNote = newNote;
window.undo = () => {
  focusEditor();
  const commandWorked = document.execCommand('undo');
  if (!commandWorked && state.historyStack.length > 1) {
    state.historyStack.pop();
    getEditor().innerHTML = state.historyStack[state.historyStack.length - 1];
  }
  saveCurrentNote(true);
};

document.addEventListener('mouseup', (event) => {
  const selection = window.getSelection();
  const floating = document.getElementById('floatingAI');
  if (selection.toString().trim().length > 0 && selection.anchorNode?.parentElement?.closest('#content')) {
    state.lastRange = selection.getRangeAt(0);
    const rect = state.lastRange.getBoundingClientRect();
    floating.style.display = 'flex';
    floating.style.top = `${rect.top + window.scrollY - 85}px`;
    floating.style.left = `${rect.left + window.scrollX}px`;
  } else if (!floating.contains(event.target)) {
    floating.style.display = 'none';
  }
});

document.addEventListener('selectionchange', () => {
  if (isSelectionInsideEditor()) {
    captureSelection();
  }
});

document.addEventListener('click', (event) => {
  const menu = document.getElementById('itemContextMenu');
  if (!menu.contains(event.target)) {
    closeContextMenu();
  }
});

getEditor().addEventListener('contextmenu', (event) => {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();
  const clickedInsideEditor = event.target?.closest?.('#content');

  if (!clickedInsideEditor || !selectedText || !isSelectionInsideEditor()) {
    return;
  }

  captureSelection();
  event.preventDefault();
  const floating = document.getElementById('floatingAI');
  const rect = state.lastRange.getBoundingClientRect();
  floating.style.display = 'flex';
  floating.style.top = `${rect.top + window.scrollY - 85}px`;
  floating.style.left = `${rect.left + window.scrollX}px`;
});

document.addEventListener('scroll', closeContextMenu, true);
themeMediaQuery.addEventListener('change', () => {
  if (state.themeMode === 'system') {
    applyTheme('system');
  }
});

getEditor().addEventListener('paste', (event) => {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    return;
  }

  const html = clipboard.getData('text/html');
  const text = clipboard.getData('text/plain');
  const renderedHtml = html ? sanitizeHtml(html) : renderMarkdownToHtml(text);
  if (!renderedHtml) {
    return;
  }

  event.preventDefault();
  takeSnapshot();
  insertHtmlAtCursor(renderedHtml);
  saveCurrentNote(true);
});

getEditor().addEventListener('keydown', (event) => {
  maybeApplyMarkdownShortcut(event);
});

getEditor().addEventListener('change', (event) => {
  if (event.target.matches('input[type="checkbox"]')) {
    saveCurrentNote(true);
  }
});

getEditor().addEventListener('click', (event) => {
  if (event.target.matches('input[type="checkbox"]')) {
    setTimeout(() => saveCurrentNote(true), 0);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel && !aiPanel.classList.contains('closed')) {
      aiPanel.classList.add('closed');
      return;
    }
  }

  if (event.key === 'Escape' && document.activeElement?.id === 'searchInput') {
    if (state.searchQuery || document.getElementById('searchInput')?.value) {
      event.preventDefault();
      window.clearSearch();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.shiftKey) {
    event.preventDefault();
    document.getElementById('searchInput')?.focus();
    document.getElementById('searchInput')?.select();
    return;
  }

  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }

  const key = event.key.toLowerCase();
  const isEditorActive = document.activeElement?.id === 'content' || isSelectionInsideEditor();
  if (!isEditorActive) {
    return;
  }

  if (key === 'b' || key === 'i') {
    event.preventDefault();
    window.formatSelection(key === 'b' ? 'bold' : 'italic');
    return;
  }

  if (event.shiftKey && key === '7') {
    event.preventDefault();
    window.formatSelection('number');
    return;
  }

  if (event.shiftKey && key === '8') {
    event.preventDefault();
    window.formatSelection('bullet');
    return;
  }

  if (event.shiftKey && key === 'k') {
    event.preventDefault();
    window.formatSelection('link');
    return;
  }

  if (event.altKey && key === '1') {
    event.preventDefault();
    window.formatSelection('h1');
    return;
  }

  if (event.altKey && key === '2') {
    event.preventDefault();
    window.formatSelection('h2');
  }
});

document.getElementById('newSectionBtn').addEventListener('click', openSectionCreator);
document.getElementById('saveSectionBtn').addEventListener('click', createSection);
document.getElementById('cancelSectionBtn').addEventListener('click', closeSectionCreator);
document.getElementById('themeToggleBtn').addEventListener('click', cycleThemeMode);
document.getElementById('contextPrimaryBtn').addEventListener('click', async () => {
  const { type, targetId, primaryAction } = state.contextMenu;
  closeContextMenu();
  if (type === 'section' && primaryAction === 'new-page-in-section') {
    await newNoteInSection(targetId);
  }
});
document.getElementById('contextRenameBtn').addEventListener('click', async () => {
  const { type, targetId } = state.contextMenu;
  closeContextMenu();
  if (type === 'section') {
    const section = getSectionById(targetId);
    if (section) {
      renameSection(section);
    }
    return;
  }
  if (type === 'page' && targetId) {
    await renamePage(targetId);
  }
});
document.getElementById('contextDeleteBtn').addEventListener('click', async () => {
  const { type, targetId } = state.contextMenu;
  closeContextMenu();
  if (type === 'section') {
    const section = getSectionById(targetId);
    if (section) {
      requestDelete('section', section.id, section.name);
    }
    return;
  }
  if (type === 'page' && targetId) {
    const note = getNoteById(targetId);
    if (note) {
      requestDelete('page', targetId, note.title || 'Untitled');
    }
  }
});
document.getElementById('confirmDeleteBtn').addEventListener('click', confirmPendingDelete);
document.getElementById('cancelDeleteBtn').addEventListener('click', clearPendingDelete);
document.getElementById('sectionNameInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    createSection();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSectionCreator();
  }
});
document.getElementById('newPageBtn').addEventListener('click', newNote);
document.getElementById('sectionSelect')?.addEventListener('change', (event) => {
  moveCurrentNoteToSection(event.target.value || null);
});
document.getElementById('aiPanel').addEventListener('click', (event) => {
  if (event.target.id === 'aiPanel') {
    document.getElementById('aiPanel').classList.add('closed');
  }
});

async function initialize() {
  applyTheme(state.themeMode);
  renderAiControls();
  await refreshCollections();
  if (state.notes[0]) {
    await openNote(state.notes[0].id);
  } else {
    await newNote();
  }
}

initialize().catch((error) => {
  setAiError(error.message || 'Failed to load notes.');
});
