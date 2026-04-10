let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
let currentMode = 'local';
let saveTimeout = null;

const ollamaUrl = window.folioAPI.ollamaUrl;
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud';

// --- UI & RICH TEXT ---
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('closed');
window.toggleAI = () => document.getElementById('aiPanel').classList.toggle('closed');
window.setMode = (mode) => {
    currentMode = mode;
    document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
    document.getElementById('modeCloud').classList.toggle('active', mode === 'cloud');
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

// --- EXPORT ---
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

// --- AI STREAMING & MARKDOWN ---
window.aiAction = async (type) => {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    const model = currentMode === 'local' ? LOCAL_MODEL : CLOUD_MODEL;
    const respEl = document.getElementById('response');
    respEl.innerText = ""; // Clear previous
    
    let fullText = "";

    try {
        const response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: `${type}: ${document.getElementById('content').innerText}` }],
                stream: true // Enable streaming
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.message && json.message.content) {
                        fullText += json.message.content;
                        // Render Markdown on the fly
                        respEl.innerHTML = marked.parse(fullText);
                        respEl.scrollTop = respEl.scrollHeight; // Auto-scroll
                    }
                } catch (e) { console.error("Error parsing chunk", e); }
            }
        }
    } catch (err) {
        respEl.innerText = "Connection failed. Is Ollama running?";
    }
};

renderNotes();
if (notes[0]) openNote(notes[0].id);