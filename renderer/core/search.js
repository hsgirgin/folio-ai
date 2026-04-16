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

  function noteMatchesSection(note, sectionId) {
    if (sectionId === 'all') {
      return true;
    }

    if (sectionId === null || sectionId === 'unsectioned') {
      return (note.sectionId || null) === null;
    }

    return (note.sectionId || null) === sectionId;
  }

  function noteMatchesFilters(note, query, sectionId) {
    return noteMatchesSection(note, sectionId) && noteMatchesSearch(note, query);
  }

  const api = {
    normalizeSearchValue,
    noteMatchesSearch,
    noteMatchesSection,
    noteMatchesFilters
  };

  globalScope.FolioSearch = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
