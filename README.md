# Folio AI

Folio is a local-first note-taking app built with Electron and plain JavaScript. It keeps the renderer browser-friendly, stores notes on-device, and uses Ollama as an optional AI assistant instead of making AI the center of the app.

## Development

1. Install dependencies:

```bash
npm install
```

2. Run the app directly from source:

```bash
npm start
```

3. Use the auto-restart development loop when you want Electron to relaunch after file changes:

```bash
npm run dev
```

4. Run automated tests:

```bash
npm test
```

5. Build a packaged desktop artifact only when you need a release build:

```bash
npm run dist
```

## Manual Smoke Test Checklist

- Launch with `npm start` and confirm the app opens without building an `.exe`.
- Create a note, reload the app, and confirm the note persists.
- Edit a note title and body, then search for words from the title and content.
- Paste rich text with a script tag or inline event handler and confirm unsafe HTML is removed.
- Try bold, lists, checklist, quote, link, and undo to confirm the editor remains stable.
- With Ollama running, test both AI model presets. With Ollama stopped, confirm the editor still works and AI shows a clear error.

## Architecture Notes

- `main.js` and `preload.js` expose a minimal host bridge for notes storage and config.
- `lib/noteRepository.js` owns file-backed persistence with separate metadata and note content files.
- `renderer/` contains portable UI modules plus a browser-safe notes bridge fallback.
- AI is provider-based and currently ships with a local Ollama provider.
