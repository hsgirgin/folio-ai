(function attachContentModule(globalScope) {
  function stripDangerousTags(html) {
    return String(html || '')
      .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(script|style|iframe|object|embed)\b[^>]*\/?>/gi, '');
  }

  function stripEventHandlers(html) {
    return html
      .replace(/\s+on\w+=(["']).*?\1/gi, '')
      .replace(/\s+on\w+=[^\s>]+/gi, '');
  }

  function stripJavascriptUrls(html) {
    return html.replace(/\s+(href|src)=(["'])javascript:[\s\S]*?\2/gi, '');
  }

  function sanitizeHtml(html) {
    return stripJavascriptUrls(stripEventHandlers(stripDangerousTags(html)));
  }

  function parseMarkdown(markdownSource) {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      return marked.parse(markdownSource);
    }
    return markdownSource;
  }

  function renderMarkdownToHtml(text) {
    const source = String(text || '').trim();
    if (!source) {
      return '';
    }
    return sanitizeHtml(parseMarkdown(source));
  }

  function decodeEntities(value) {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function getPlainTextFromHtml(html) {
    if (typeof document !== 'undefined') {
      const template = document.createElement('template');
      template.innerHTML = html || '';
      return template.content.textContent || '';
    }

    return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  }

  const api = {
    sanitizeHtml,
    renderMarkdownToHtml,
    getPlainTextFromHtml
  };

  globalScope.FolioContent = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
