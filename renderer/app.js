let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
let currentMode = 'local';

const ollamaUrl = window.folioAPI.ollamaUrl;
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud';

// UI Helpers
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('closed');
window.toggleAI = () => document.getElementById('aiPanel').classList.toggle('closed');

window.setMode = (mode) => {
  currentMode = mode;
  document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
  document.getElementById('modeCloud').classList.toggle('active', mode === 'cloud');
};

// Data Management
function saveNotes() { localStorage.setItem('folio-notes', JSON.stringify(notes)); }

function renderNotes() {
  const el = document.getElementById('notesList');
  el.innerHTML = '';
  notes.forEach(note => {
    const div = document.createElement('div');
    div.className = `note-item ${note.id === currentNoteId ? 'active' : ''}`;
    div.textContent = note.title || 'Untitled Note';
    div.onclick = () => openNote(note.id);
    el.appendChild(div);
  });
}

window.newNote = () => {
  const note = { id: Date.now(), title: '', content: '' };
  notes.unshift(note);
  currentNoteId = note.id;
  document.getElementById('title').value = '';
  document.getElementById('content').value = '';
  saveNotes();
  renderNotes();
  document.getElementById('title').focus();
};

function openNote(id) {
  currentNoteId = id;
  const note = notes.find(n => n.id === id);
  if (!note) return;
  document.getElementById('title').value = note.title;
  document.getElementById('content').value = note.content;
  renderNotes();
}

window.saveCurrentNote = () => {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note) return;
  note.title = document.getElementById('title').value;
  note.content = document.getElementById('content').value;
  saveNotes();
  renderNotes();
};

// AI Engine
async function verifyModel(modelName) {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    const data = await res.json();
    return data.models.some(m => m.name.includes(modelName));
  } catch { return false; }
}

window.installModel = async (modelName) => {
  const resp = document.getElementById('response');
  resp.innerText = `Starting download for ${modelName}... Check Ollama tray for progress.`;
  await fetch(`${ollamaUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ name: modelName, stream: false }) });
};

window.aiAction = async (type) => {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note || !note.content) return;

  const model = currentMode === 'local' ? LOCAL_MODEL : CLOUD_MODEL;
  const resp = document.getElementById('response');

  resp.innerText = "Checking model...";
  const isReady = await verifyModel(model);
  if (!isReady) {
    resp.innerHTML = `⚠️ ${model} missing.<br><button class="btn-primary" onclick="installModel('${model}')">Install Model</button>`;
    return;
  }

  resp.innerText = "AI is thinking...";
  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: model,
        stream: false,
        messages: [{ role: 'user', content: `${type === 'summarize' ? 'Summarize' : 'Rewrite professionally'}: ${note.content}` }]
      })
    });
    const data = await res.json();
    resp.innerText = data.message.content;
  } catch {
    resp.innerText = "Connection lost. Is Ollama running?";
  }
};

// Init
renderNotes();
if (notes[0]) openNote(notes[0].id);