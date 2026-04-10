let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
let currentMode = 'local'; // Restored mode state
let saveTimeout = null;

const ollamaUrl = window.folioAPI.ollamaUrl;
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud';

// --- UI HELPERS ---
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('closed');
window.toggleAI = () => document.getElementById('aiPanel').classList.toggle('closed');

// Restored Mode Selection Logic
window.setMode = (mode) => {
    currentMode = mode;
    document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
    document.getElementById('modeCloud').classList.toggle('active', mode === 'cloud');
    document.getElementById('response').innerText = `Engine switched to ${mode.toUpperCase()}.`;
};

window.format = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    document.getElementById('content').focus();
};

window.insertTable = () => {
    const table = `<table border="1" style="width:100%; border-collapse:collapse; margin:10px 0;"><tr><td>-</td><td>-</td></tr></table><p></p>`;
    document.execCommand('insertHTML', false, table);
};

// --- NOTE LOGIC ---
window.newNote = () => {
    const note = { id: Date.now(), title: '', content: '', isPinned: false };
    notes.unshift(note);
    currentNoteId = note.id;
    document.getElementById('title').value = '';
    document.getElementById('content').innerHTML = '';
    saveNotes();
    renderNotes();
};

window.togglePin = (e, id) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === id);
    if (note) {
        note.isPinned = !note.isPinned;
        saveNotes();
        renderNotes();
    }
};

function saveNotes() { localStorage.setItem('folio-notes', JSON.stringify(notes)); }

function renderNotes() {
    const el = document.getElementById('notesList');
    el.innerHTML = '';
    const sortedNotes = [...notes].sort((a, b) => {
        if (a.isPinned === b.isPinned) return b.id - a.id;
        return a.isPinned ? -1 : 1;
    });

    sortedNotes.forEach(note => {
        const div = document.createElement('div');
        div.className = `note-item ${note.id === currentNoteId ? 'active' : ''}`;
        div.innerHTML = `
            <span style="flex:1" onclick="openNote(${note.id})">${note.title || 'Untitled'}</span>
            <span style="cursor:pointer; opacity:${note.isPinned ? '1' : '0.3'}" onclick="togglePin(event, ${note.id})">📌</span>
        `;
        el.appendChild(div);
    });
}

function openNote(id) {
    currentNoteId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;
    document.getElementById('title').value = note.title;
    document.getElementById('content').innerHTML = note.content;
    renderNotes();
}

window.saveCurrentNote = () => {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        note.title = document.getElementById('title').value;
        note.content = document.getElementById('content').innerHTML;
        saveNotes();
        renderNotes();
    }, 500);
};

// --- EXPORT & AI ---
window.exportMarkdown = () => {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    const blob = new Blob([`# ${note.title}\n\n` + document.getElementById('content').innerText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title || 'note'}.md`;
    a.click();
};

window.aiAction = async (type) => {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    // Uses the mode selected by the toggle
    const model = currentMode === 'local' ? LOCAL_MODEL : CLOUD_MODEL;
    const resp = document.getElementById('response');
    resp.innerText = `[${currentMode.toUpperCase()}] Thinking...`;

    try {
        const res = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            body: JSON.stringify({
                model: model,
                stream: false,
                messages: [{ role: 'user', content: `${type}: ${document.getElementById('content').innerText}` }]
            })
        });
        const data = await res.json();
        resp.innerText = data.message.content;
    } catch { resp.innerText = "Error: Is Ollama running?"; }
};

renderNotes();
if (notes[0]) openNote(notes[0].id);