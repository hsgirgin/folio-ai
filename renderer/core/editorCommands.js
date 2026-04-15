(function attachEditorCommands(globalScope) {
  const BLOCK_TAGS = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

  function normalizeUrl(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed || /^javascript:/i.test(trimmed)) {
      return '';
    }
    if (/^[a-z]+:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  function getMarkdownShortcut(prefix) {
    const trimmed = String(prefix || '').trim();
    const shortcutMap = [
      { pattern: /^##$/, kind: 'h2', triggerLength: 2 },
      { pattern: /^#$/, kind: 'h1', triggerLength: 1 },
      { pattern: /^[-*]$/, kind: 'ul', triggerLength: 1 },
      { pattern: /^1\.$/, kind: 'ol', triggerLength: 2 },
      { pattern: /^>$/, kind: 'blockquote', triggerLength: 1 },
      { pattern: /^\[\]$|^\[ \]$/, kind: 'checklist', triggerLength: trimmed === '[ ]' ? 3 : 2 }
    ];

    return shortcutMap.find((item) => item.pattern.test(trimmed)) || null;
  }

  const api = {
    BLOCK_TAGS,
    normalizeUrl,
    getMarkdownShortcut
  };

  globalScope.FolioEditorCommands = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
