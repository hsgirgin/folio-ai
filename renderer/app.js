let notes = JSON.parse(localStorage.getItem('folio-notes') || '[]');
let currentNoteId = null;
const ollamaUrl = window.folioAPI?.ollamaUrl || 'http://localhost:11434';

// Model Configs
const LOCAL_MODEL = 'llama3.1:8b';
const CLOUD_MODEL = 'gpt-oss:120b-cloud'; // Ollama's high-perf cloud model
let aiSource = localStorage.getItem('ai-source') || 'local';

function setAiSource(source) {
    aiSource = source;
    localStorage.setItem('ai-source', source);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${source}`).classList.add('active');
}

async function callOllama(systemPrompt, userPrompt, isCloud = false) {
    const responseEl = document.getElementById('response');
    responseEl.innerText = isCloud ? 'Connecting to Ollama Cloud...' : 'Thinking locally...';
    
    const targetModel = isCloud ? CLOUD_MODEL : LOCAL_MODEL;

    try {
        const res = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            body: JSON.stringify({
                model: targetModel,
                stream: false,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        if (res.status === 404) return `Model ${targetModel} not found. Click "Install" below.`;
        if (res.status === 401) return "Cloud Error: Please run 'ollama signin' in your terminal.";

        const data = await res.json();
        return data.message?.content || 'Empty response.';
    } catch (err) {
        return "Connection Error: Is Ollama running?";
    }
}

async function aiAction(type) {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note || !note.content) return;

    const prompts = {
        summarize: "Summarize this note in 3 short bullet points.",
        improve: "Refine this text to be more professional."
    };

    const result = await callOllama(prompts[type], note.content, aiSource === 'cloud');
    document.getElementById('response').innerText = result;
}

async function installModel() {
    const responseEl = document.getElementById('response');
    const modelToInstall = aiSource === 'cloud' ? CLOUD_MODEL : LOCAL_MODEL;
    responseEl.innerText = `Pulling ${modelToInstall}... Check your Ollama tray icon.`;
    
    try {
        await fetch(`${ollamaUrl}/api/pull`, {
            method: 'POST',
            body: JSON.stringify({ name: modelToInstall })
        });
    } catch (err) {
        responseEl.innerText = "Installation failed to start.";
    }
}

// Initial UI load
setAiSource(aiSource);
// ... Include your existing Note saving/rendering functions here ...