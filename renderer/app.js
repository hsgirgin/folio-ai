let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
let currentMode = 'local'; // 'local' or 'cloud'

const ollamaUrl = window.folioAPI.ollamaUrl;
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud';

function setMode(mode) {
  currentMode = mode;
  document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
  document.getElementById('modeCloud').classList.toggle('active', mode === 'cloud');
}

function saveNotes() {
  localStorage.setItem('folio-notes', JSON.stringify(notes));
}

function renderNotes() {
  const el = document.getElementById('notesList');
  el.innerHTML = '';
  notes.forEach(note => {
    const div = document.createElement('div');
    div.textContent = note.title || 'Untitled Note';
    div.className = `note-item ${note.id === currentNoteId ? 'active' : ''}`;
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
  renderNotes(); // Refresh active state
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
  const model = currentMode === 'local' ? LOCAL_MODEL : CLOUD_MODEL;
  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    const data = await res.json();
    return data.message?.content || 'No response';
  } catch (err) {
    return `Error: ${err.message}. Check if Ollama is running and model ${model} is pulled.`;
  }
}

async function aiAction(type) {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note || !note.content) return;

  const prompts = {
    summarize: 'Summarize this note in 3 concise bullet points.',
    improve: 'Rewrite this note to be clearer and more professional while keeping the same meaning.'
  };

  document.getElementById('response').innerText = 'Thinking...';
  const result = await callOllama(prompts[type], note.content);
  document.getElementById('response').innerText = result;
}

async function askCustom() {
  const note = notes.find(n => n.id === currentNoteId);
  const query = document.getElementById('query').value;
  if (!note || !query) return;

  document.getElementById('response').innerText = 'Analyzing...';
  const result = await callOllama(
    'Answer questions accurately based on the note content.',
    `Note Content:\n${note.content}\n\nUser Question: ${query}`
  );
  document.getElementById('response').innerText = result;
}

renderNotes();
if (notes[0]) openNote(notes[0].id);