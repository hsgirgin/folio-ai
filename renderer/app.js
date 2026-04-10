let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
let currentMode = 'local';

const ollamaUrl = window.folioAPI.ollamaUrl;
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud';

// Verify if the model is installed before running an action
async function verifyModel(modelName) {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    const data = await res.json();
    const isInstalled = data.models.some(m => m.name.includes(modelName));
    return isInstalled;
  } catch (err) {
    console.error("Connection error:", err);
    return false;
  }
}

// Pull (Install) model logic
window.installModel = async function(modelName) {
  const responseEl = document.getElementById('response');
  responseEl.innerText = `Installing ${modelName}... Please wait.`;
  try {
    await fetch(`${ollamaUrl}/api/pull`, {
      method: 'POST',
      body: JSON.stringify({ name: modelName, stream: false })
    });
    responseEl.innerText = `✅ ${modelName} installed! Try your request again.`;
  } catch (err) {
    responseEl.innerText = `Installation failed: ${err.message}`;
  }
};

window.setMode = function(mode) {
  currentMode = mode;
  document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
  document.getElementById('modeCloud').classList.toggle('active', mode === 'cloud');
  document.getElementById('response').innerText = `Switched to ${mode} mode.`;
};

window.newNote = function() {
  const note = { id: Date.now(), title: '', content: '' };
  notes.unshift(note);
  currentNoteId = note.id;
  document.getElementById('title').value = '';
  document.getElementById('content').value = '';
  saveNotes();
  renderNotes();
};

window.saveCurrentNote = function() {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note) return;
  note.title = document.getElementById('title').value;
  note.content = document.getElementById('content').value;
  saveNotes();
  renderNotes();
};

function saveNotes() {
  localStorage.setItem('folio-notes', JSON.stringify(notes));
}

function renderNotes() {
  const el = document.getElementById('notesList');
  el.innerHTML = '';
  notes.forEach(note => {
    const div = document.createElement('div');
    div.className = `note-item ${note.id === currentNoteId ? 'active' : ''}`;
    div.textContent = note.title || 'Untitled';
    div.onclick = () => openNote(note.id);
    el.appendChild(div);
  });
}

function openNote(id) {
  currentNoteId = id;
  const note = notes.find(n => n.id === id);
  if (!note) return;
  document.getElementById('title').value = note.title;
  document.getElementById('content').value = note.content;
  renderNotes();
}

window.aiAction = async function(type) {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note || !note.content) return;

  const model = currentMode === 'local' ? LOCAL_MODEL : CLOUD_MODEL;
  const responseEl = document.getElementById('response');

  // Check model every time button is clicked
  const isReady = await verifyModel(model);
  if (!isReady) {
    responseEl.innerHTML = `⚠️ ${model} not found. <button onclick="installModel('${model}')">Install Now</button>`;
    return;
  }

  const prompts = {
    summarize: 'Summarize this note.',
    improve: 'Refine this text.'
  };

  responseEl.innerText = 'Thinking...';
  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: model,
        stream: false,
        messages: [{ role: 'user', content: `${prompts[type]}: ${note.content}` }]
      })
    });
    const data = await res.json();
    responseEl.innerText = data.message.content;
  } catch (err) {
    responseEl.innerText = "Error: Could not connect to Ollama.";
  }
};

window.askCustom = async function() {
  const note = notes.find(n => n.id === currentNoteId);
  const query = document.getElementById('query').value;
  if (!note || !query) return;

  const model = currentMode === 'local' ? LOCAL_MODEL : CLOUD_MODEL;
  const responseEl = document.getElementById('response');

  const isReady = await verifyModel(model);
  if (!isReady) {
    responseEl.innerHTML = `⚠️ ${model} not found. <button onclick="installModel('${model}')">Install Now</button>`;
    return;
  }

  responseEl.innerText = 'Analyzing...';
  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: model,
        stream: false,
        messages: [{ role: 'user', content: `Note: ${note.content}\n\nQuestion: ${query}` }]
      })
    });
    const data = await res.json();
    responseEl.innerText = data.message.content;
  } catch (err) {
    responseEl.innerText = "Error: Could not connect to Ollama.";
  }
};

renderNotes();
if (notes[0]) openNote(notes[0].id);