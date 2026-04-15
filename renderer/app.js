const { sanitizeHtml, renderMarkdownToHtml } = window.FolioContent;
const { normalizeSearchValue, noteMatchesSearch } = window.FolioSearch;
const { BLOCK_TAGS, normalizeUrl, getMarkdownShortcut } = window.FolioEditorCommands;

const hostBridge = window.FolioHostBridge.createBridge(window.folioAPI);
const storage = window.FolioStorage.createStorage(hostBridge);
const aiProvider = window.FolioAI.createAIProvider({ hostBridge });

marked.setOptions({
  breaks: true,
  gfm: true
});

const state = {
  notes: [],
  currentNoteId: null,
  saveTimeout: null,
  lastRange: null,
  lastAiResult: '',
  historyStack: [],
  searchQuery: '',
  deleteResetTimers: new Map()
};

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

function setStatus(message = '') {
  const overlay = document.getElementById('statusOverlay');
  overlay.textContent = message;
  overlay.style.display = message ? 'block' : 'none';
}

function setAiError(message) {
  const area = document.getElementById('replacementArea');
  const text = document.getElementById('replacementText');
  area.style.display = 'block';
  text.textContent = message;
  setStatus('');
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

  listItem.appendChild(checkbox);
  listItem.appendChild(text);
  checklist.appendChild(listItem);
  block.replaceWith(checklist);

  setCaretAtStart(text);
  saveCurrentNote(true);
  return true;
}

function applyMarkdownShortcut(shortcut) {
  removeCharactersBeforeCaret(shortcut.triggerLength);

  switch (shortcut.kind) {
    case 'h1':
      return formatBlock('H1');
    case 'h2':
      return formatBlock('H2');
    case 'ul':
      return runEditorCommand('insertUnorderedList');
    case 'ol':
      return runEditorCommand('insertOrderedList');
    case 'blockquote':
      return formatBlock('BLOCKQUOTE');
    case 'checklist':
      return insertChecklist();
    default:
      return false;
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

function renderNotes() {
  const list = document.getElementById('notesList');
  const emptyState = document.getElementById('notesEmptyState');
  const clearButton = document.getElementById('clearSearchBtn');
  const filteredNotes = state.notes.filter((note) => noteMatchesSearch(note, state.searchQuery));

  list.innerHTML = '';
  clearButton.style.display = state.searchQuery ? 'inline-flex' : 'none';
  emptyState.style.display = filteredNotes.length === 0 ? 'block' : 'none';

  filteredNotes.forEach((note) => {
    const item = document.createElement('div');
    item.className = `note-item ${note.id === state.currentNoteId ? 'active' : ''}`;
    item.addEventListener('click', () => openNote(note.id));

    const title = document.createElement('span');
    title.textContent = note.title || 'Untitled';

    const button = document.createElement('button');
    button.className = 'delete-btn';
    button.type = 'button';
    button.textContent = 'x';
    button.setAttribute('aria-label', 'Delete note');
    button.addEventListener('click', (event) => deleteNote(event, note.id));

    item.appendChild(title);
    item.appendChild(button);
    list.appendChild(item);
  });
}

async function refreshNotes() {
  state.notes = await storage.listNotes();
  renderNotes();
}

async function persistCurrentNoteNow() {
  if (!state.currentNoteId) {
    return;
  }

  await storage.updateNote(state.currentNoteId, {
    title: getTitleInput().value,
    content: getEditor().innerHTML
  });

  await refreshNotes();
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
  getTitleInput().value = note.title || '';
  getEditor().innerHTML = note.content || '';
  document.getElementById('chatHistory').innerHTML = '';
  document.getElementById('replacementArea').style.display = 'none';
  state.historyStack = [note.content || ''];
  renderNotes();
}

async function newNote() {
  await flushPendingSave();
  const note = await storage.createNote({ title: '', content: '' });
  await refreshNotes();
  await openNote(note.id);
  focusEditor();
}

async function deleteNote(event, id) {
  event.stopPropagation();
  const button = event.currentTarget;

  if (!button.classList.contains('confirm-delete')) {
    button.classList.add('confirm-delete');
    button.textContent = 'Confirm?';

    const existingTimer = state.deleteResetTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      button.classList.remove('confirm-delete');
      button.textContent = 'x';
    }, 3000);

    state.deleteResetTimers.set(id, timer);
    focusEditor();
    return;
  }

  await flushPendingSave();
  await storage.deleteNote(id);
  await refreshNotes();

  if (id === state.currentNoteId) {
    if (state.notes[0]) {
      await openNote(state.notes[0].id);
    } else {
      await newNote();
    }
  } else {
    focusEditor();
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

  presetSelect.addEventListener('change', (event) => {
    aiProvider.setActivePresetId(event.target.value);
    const preset = aiProvider.getActivePreset();
    setStatus(`Selected ${preset.label} (${preset.model})`);
    window.setTimeout(() => setStatus(''), 1800);
  });
}

async function ensureAiReady() {
  try {
    const preset = aiProvider.getActivePreset();
    setStatus('Checking Ollama...');
    const available = await aiProvider.isAvailable();
    if (!available) {
      setStatus('');
      setAiError('Ollama is offline. Start Ollama to use AI features.');
      return false;
    }

    setStatus(`Loading ${preset.label} (${preset.model}) if needed. First reply can take a while.`);
    await aiProvider.ensureModelReady(setStatus);
    return true;
  } catch (error) {
    setStatus('');
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

  document.getElementById('floatingAI').style.display = 'none';

  if (!(await ensureAiReady())) {
    return;
  }

  const area = document.getElementById('replacementArea');
  const text = document.getElementById('replacementText');
  area.style.display = 'block';
  text.innerHTML = '<em>Thinking...</em>';
  state.lastAiResult = '';
  const preset = aiProvider.getActivePreset();
  setStatus(`Generating with ${preset.label} (${preset.model})...`);

  try {
    await aiProvider.rewriteSelection(instruction, selectedText, (partial) => {
      state.lastAiResult = partial;
      text.innerHTML = marked.parse(partial);
      setStatus(`Receiving response from ${preset.label}...`);
    });
    setStatus('');
  } catch (error) {
    setStatus('');
    text.textContent = error.message || 'Error calling AI.';
  }
}

async function runAiChat() {
  const input = document.getElementById('sidebarChatInput');
  const query = input.value.trim();
  if (!query) {
    return;
  }

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
  const preset = aiProvider.getActivePreset();
  setStatus(`Generating with ${preset.label} (${preset.model})...`);

  try {
    await aiProvider.chat(getEditor().innerText, query, (partial) => {
      aiBubble.innerHTML = marked.parse(partial);
      setStatus(`Receiving response from ${preset.label}...`);
    });
    setStatus('');
  } catch (error) {
    setStatus('');
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

window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('closed');
window.toggleAI = () => document.getElementById('aiPanel').classList.toggle('closed');
window.updateSearch = (value) => {
  state.searchQuery = normalizeSearchValue(value);
  renderNotes();
};
window.clearSearch = () => {
  const input = document.getElementById('searchInput');
  state.searchQuery = '';
  if (input) {
    input.value = '';
  }
  renderNotes();
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
window.openNote = openNote;
window.saveCurrentNote = saveCurrentNote;
window.deleteNote = deleteNote;
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

async function initialize() {
  renderAiControls();
  await refreshNotes();

  if (state.notes[0]) {
    await openNote(state.notes[0].id);
  } else {
    await newNote();
  }
}

initialize().catch((error) => {
  setAiError(error.message || 'Failed to load notes.');
});
