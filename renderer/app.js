let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
let currentMode = 'local'; // Default mode

const ollamaUrl = window.folioAPI.ollamaUrl;
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud'; // Ensure you have run 'ollama pull' for this

// Switch between Local and Cloud
function setMode(mode) {
  currentMode = mode;
  document.getElementById('btnLocal').classList.toggle('active', mode === 'local');
  document.getElementById('btnCloud').classList.toggle('active', mode === 'cloud');
  document.getElementById('response').textContent = `Switched to ${mode} mode.`;
}

function saveNotes() {
  localStorage.setItem('folio-notes', JSON.stringify(notes));
}

function renderNotes() {
  const el = document.getElementById('notesList');
  el.innerHTML = '';
  notes.forEach(note => {
    const div = document.createElement('div');
    div.textContent = note.title || 'Untitled';
    div.style.cursor = 'pointer';
    div.style.padding = '8px';
    div.style.borderBottom = '1px solid #eee';
    div.onclick = () => openNote(note.id);
    el.appendChild(div);
  });
}

function newNote() {
  const note = { id: Date.now(), title: '', content: '' };
  notes.unshift(note);
  currentNoteId = note.id;
  document.getElementById('title').value = '';
  document.getElementById('content').value = '';
  saveNotes();
  renderNotes();
}

function openNote(id) {
  currentNoteId = id;
  const note = notes.find(n => n.id === id);
  if (!note) return;
  document.getElementById('title').value = note.title;
  document.getElementById('content').value = note.content;
}

function saveCurrentNote() {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note) return;
  note.title = document.getElementById('title').value;
  note.content = document.getElementById('content').value;
  saveNotes();
  renderNotes();
}

async function callOllama(systemPrompt, userPrompt) {
  const activeModel = currentMode === 'local' ? LOCAL_MODEL : CLOUD_MODEL;
  
  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!res.ok) throw new Error(`Ollama Cloud/Local error: ${res.statusText}`);

    const data = await res.json();
    return data.message?.content || 'No response from model.';
  } catch (err) {
    return `Error: ${err.message}. Ensure Ollama is running and you have pulled '${activeModel}'.`;
  }
}

async function aiAction(type) {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note || !note.content) {
    document.getElementById('response').textContent = "Please select a note with text first.";
    return;
  }

  const prompts = {
    summarize: 'Summarize this note concisely.',
    improve: 'Improve this writing while preserving meaning.'
  };

  document.getElementById('response').textContent = `Thinking (${currentMode})...`;
  const result = await callOllama(prompts[type], note.content);
  document.getElementById('response').textContent = result;
}

async function askCustom() {
  const note = notes.find(n => n.id === currentNoteId);
  const query = document.getElementById('query').value;
  if (!note || !query) return;

  document.getElementById('response').textContent = `Asking AI (${currentMode})...`;
  const result = await callOllama(
    'Answer questions about the provided note.',
    `Note:\n${note.content}\n\nQuestion: ${query}`
  );
  document.getElementById('response').textContent = result;
}

// Initial Load
renderNotes();
if (notes[0]) openNote(notes[0].id);