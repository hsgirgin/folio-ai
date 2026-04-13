let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
let saveTimeout = null;
let lastRange = null;
let lastAiResult = "";
let historyStack = [];
let currentMode = 'cloud'; 

const ollamaUrl = window.folioAPI.ollamaUrl;
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud';

marked.setOptions({
    breaks: true,
    gfm: true
});

function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    template.content.querySelectorAll('script, style, iframe, object, embed').forEach((node) => {
        node.remove();
    });

    template.content.querySelectorAll('*').forEach((node) => {
        [...node.attributes].forEach((attr) => {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();

            if (name.startsWith('on')) {
                node.removeAttribute(attr.name);
            }

            if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
                node.removeAttribute(attr.name);
            }
        });
    });

    return template.innerHTML;
}

function renderMarkdownToHtml(text) {
    const source = (text || "").trim();
    if (!source) return "";
    return sanitizeHtml(marked.parse(source));
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
        nextRange.selectNodeContents(document.getElementById('content'));
    }

    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
}

function insertHtmlAtCursor(html) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

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

// --- AUTO-PULL LOGIC ---
async function ensureModelExists(modelName) {
    if (currentMode === 'cloud') return true; // Skip for cloud

    const overlay = document.getElementById('statusOverlay');
    try {
        // Check if model exists locally
        const listRes = await fetch(`${ollamaUrl}/api/tags`);
        const listData = await listRes.json();
        const exists = listData.models?.some(m => m.name.startsWith(modelName.split(':')[0]));
        
        if (exists) return true;

        // Trigger Pull
        overlay.style.display = 'block';
        overlay.innerText = `Downloading ${modelName}... Please wait.`;
        
        const pullRes = await fetch(`${ollamaUrl}/api/pull`, {
            method: 'POST',
            body: JSON.stringify({ name: modelName, stream: false })
        });

        if (pullRes.ok) {
            overlay.style.display = 'none';
            return true;
        }
    } catch (e) {
        overlay.innerText = "Connection Error: Is Ollama running?";
        return false;
    }
    return false;
}

// --- MODEL SELECTION ---
window.toggleModel = () => {
    const btn = document.getElementById('modelToggle');
    const icon = document.getElementById('modelIcon');
    const label = document.getElementById('modelLabel');

    if (currentMode === 'cloud') {
        currentMode = 'local';
        btn.classList.add('local');
        icon.innerText = '💻';
        label.innerText = 'Local';
    } else {
        currentMode = 'cloud';
        btn.classList.remove('local');
        icon.innerText = '🌐';
        label.innerText = 'Cloud';
    }
};

// --- UNDO ---
function takeSnapshot() {
    const content = document.getElementById('content').innerHTML;
    if (historyStack[historyStack.length - 1] !== content) {
        historyStack.push(content);
        if (historyStack.length > 50) historyStack.shift();
    }
}
window.undo = () => {
    if (historyStack.length > 1) {
        historyStack.pop();
        document.getElementById('content').innerHTML = historyStack[historyStack.length-1];
        saveCurrentNote(true);
    }
};

// --- UI & SELECTION ---
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('closed');
window.toggleAI = () => document.getElementById('aiPanel').classList.toggle('closed');

document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    if (selection.toString().trim().length > 0 && selection.anchorNode.parentElement?.closest('#content')) {
        lastRange = selection.getRangeAt(0);
        const rect = lastRange.getBoundingClientRect();
        const menu = document.getElementById('floatingAI');
        menu.style.display = 'flex';
        menu.style.top = `${rect.top + window.scrollY - 85}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;
    } else if (!document.getElementById('floatingAI').contains(e.target)) {
        document.getElementById('floatingAI').style.display = 'none';
    }
});

// --- AI CORE ACTIONS ---
window.aiContextual = async (action) => {
    const selectedText = lastRange ? lastRange.toString().trim() : "";
    let instruction = (action === 'custom') ? document.getElementById('customPrompt').value : 
        (action === 'simplify' ? "Rewrite to be simpler." : "Fix grammar/spelling.");
    
    document.getElementById('floatingAI').style.display = 'none';
    const activeModel = currentMode === 'cloud' ? CLOUD_MODEL : LOCAL_MODEL;
    
    // Ensure model is there before proceeding
    const ready = await ensureModelExists(activeModel);
    if (!ready) return;

    if (document.getElementById('aiPanel').classList.contains('closed')) toggleAI();
    const zone = document.getElementById('replacementArea');
    const txt = document.getElementById('replacementText');
    zone.style.display = 'block';
    txt.innerHTML = "<em>Thinking...</em>";
    lastAiResult = "";

    try {
        const response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            body: JSON.stringify({
                model: activeModel,
                messages: [{ role: 'system', content: "Output ONLY the replacement text. No talk." },
                           { role: 'user', content: `${instruction}: "${selectedText}"` }],
                stream: true
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                        lastAiResult += json.message.content;
                        txt.innerHTML = marked.parse(lastAiResult);
                    }
                }
            }
        }
    } catch (e) { txt.innerText = "Error calling AI."; }
};

window.applyReplacement = () => {
    if (!lastRange || !lastAiResult) return;
    takeSnapshot();
    const renderedHtml = renderMarkdownToHtml(lastAiResult) || `<p>${lastAiResult}</p>`;
    insertHtmlAtRange(lastRange, renderedHtml);
    document.getElementById('replacementArea').style.display = 'none';
    saveCurrentNote();
};

window.aiChat = async () => {
    const input = document.getElementById('sidebarChatInput');
    const history = document.getElementById('chatHistory');
    const query = input.value.trim();
    if (!query) return;

    const activeModel = currentMode === 'cloud' ? CLOUD_MODEL : LOCAL_MODEL;
    const ready = await ensureModelExists(activeModel);
    if (!ready) return;

    const userDiv = document.createElement('div');
    userDiv.className = 'chat-bubble user-msg';
    userDiv.innerText = query;
    history.prepend(userDiv);
    input.value = "";

    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-bubble';
    history.prepend(aiDiv);

    let fullAiResponse = "";
    try {
        const response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            body: JSON.stringify({
                model: activeModel,
                messages: [{ role: 'system', content: "You are a helpful assistant." },
                           { role: 'user', content: `Context: ${document.getElementById('content').innerText}\n\nQuestion: ${query}` }],
                stream: true
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                        fullAiResponse += json.message.content;
                        aiDiv.innerHTML = marked.parse(fullAiResponse);
                    }
                }
            }
        }
    } catch (e) { aiDiv.innerText = "AI Offline."; }
};

// --- CORE NOTES ---
window.newNote = () => {
    const note = { id: Date.now(), title: '', content: '' };
    notes.unshift(note);
    openNote(note.id);
};

window.openNote = (id) => {
    currentNoteId = id;
    const note = notes.find(n => n.id === id);
    document.getElementById('title').value = note.title;
    document.getElementById('content').innerHTML = note.content;
    document.getElementById('chatHistory').innerHTML = "";
    historyStack = [note.content];
    renderNotes();
};

window.saveCurrentNote = (skipSnapshot = false) => {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    if (!skipSnapshot) takeSnapshot();
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        note.title = document.getElementById('title').value;
        note.content = document.getElementById('content').innerHTML;
        localStorage.setItem('folio-notes', JSON.stringify(notes));
        renderNotes();
    }, 500);
};

document.getElementById('content').addEventListener('paste', (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const html = clipboard.getData('text/html');
    const text = clipboard.getData('text/plain');
    const renderedHtml = html ? sanitizeHtml(html) : renderMarkdownToHtml(text);

    if (!renderedHtml) return;

    event.preventDefault();
    takeSnapshot();
    insertHtmlAtCursor(renderedHtml);
    saveCurrentNote(true);
});

function renderNotes() {
    const el = document.getElementById('notesList');
    el.innerHTML = '';
    notes.forEach(note => {
        const div = document.createElement('div');
        div.className = `note-item ${note.id === currentNoteId ? 'active' : ''}`;
        
        // Clicking the item opens the note
        div.onclick = () => openNote(note.id);

        div.innerHTML = `
            <span>${note.title || 'Untitled'}</span>
            <button class="delete-btn" onclick="deleteNote(event, ${note.id})">×</button>
        `;
        el.appendChild(div);
    });
}
window.deleteNote = (event, id) => {
    event.stopPropagation();
    const btn = event.currentTarget;
    const content = document.getElementById('content');

    // If it's the first click, "Arm" the button
    if (!btn.classList.contains('confirm-delete')) {
        btn.classList.add('confirm-delete');
        btn.innerText = 'Confirm?';
        
        // Auto-reset the button if they don't click it again within 3 seconds
        setTimeout(() => {
            btn.classList.remove('confirm-delete');
            btn.innerText = '×';
        }, 3000);
        
        content.focus(); // Keep focus on editor
        return;
    }

    // Second click: Actual deletion logic
    notes = notes.filter(n => n.id !== id);
    localStorage.setItem('folio-notes', JSON.stringify(notes));

    if (id === currentNoteId) {
        if (notes.length > 0) {
            openNote(notes[0].id);
        } else {
            newNote();
        }
    } else {
        renderNotes();
        content.focus();
    }
};

if (notes[0]) openNote(notes[0].id); else newNote();
