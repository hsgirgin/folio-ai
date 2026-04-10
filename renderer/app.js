let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
const ollamaUrl = window.folioAPI.ollamaUrl;

// Change this to the exact model name you have downloaded (e.g., 'llama3')
const model = 'llama3.1:8b'; 

function saveNotes() {
  localStorage.setItem('folio-notes', JSON.stringify(notes));
}

function renderNotes() {
  const el = document.getElementById('notesList');
  el.innerHTML = '';
  notes.forEach(note => {
    const div = document.createElement('div');
    div.textContent = note.title || 'Untitled';
    div.className = 'note-item';
    div.style.cursor = 'pointer';
    div.style.padding = '6px 0';
    div.onclick = () => openNote(note.id);
    el.appendChild(div);
  });
}

function newNote() {
  const note = { id: Date.now(), title: '', content: '' };
  notes.unshift(note);
  currentNoteId = note.id;
  saveNotes();
  renderNotes();
  openNote(note.id);
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
  const responseEl = document.getElementById('response');
  responseEl.textContent = 'Thinking...';

  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!res.ok) {
        const errorData = await res.text();
        return `Error: ${res.status}. ${errorData}. Check if model '${model}' is installed.`;
    }

    const data = await res.json();
    return data.message?.content || 'Error: Received empty response from model.';
  } catch (err) {
    return `Connection Error: ${err.message}. Ensure Ollama is running at ${ollamaUrl}`;
  }
}

async function aiAction(type) {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note || !note.content) {
      document.getElementById('response').textContent = "Please select a note with content first.";
      return;
  }

  const prompts = {
    summarize: 'Summarize this note concisely.',
    improve: 'Improve this writing while preserving meaning.'
  };

  const result = await callOllama(prompts[type], note.content);
  document.getElementById('response').textContent = result;
}

async function askCustom() {
  const note = notes.find(n => n.id === currentNoteId);
  const query = document.getElementById('query').value;
  
  if (!note) return;
  if (!query) {
      document.getElementById('response').textContent = "Please enter a question.";
      return;
  }

  const result = await callOllama(
    'Answer questions about the provided note.',
    `Note Content:\n${note.content}\n\nUser Question: ${query}`
  );

  document.getElementById('response').textContent = result;
}

renderNotes();
if (notes[0]) openNote(notes[0].id);