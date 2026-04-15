(function attachSearchModule(globalScope) {
  function normalizeSearchValue(value) {
    return String(value || '').toLowerCase().trim();
  }

  function noteMatchesSearch(note, query) {
    if (!query) {
      return true;
    }

    const title = normalizeSearchValue(note.title);
    const excerpt = normalizeSearchValue(note.excerpt);
    const searchText = normalizeSearchValue(note.searchText);
    return title.includes(query) || excerpt.includes(query) || searchText.includes(query);
  }

  const api = {
    normalizeSearchValue,
    noteMatchesSearch
  };

  globalScope.FolioSearch = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
