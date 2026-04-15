(function attachHostBridge(globalScope) {
  function getFallbackConfig() {
    return {
      platform: 'browser',
      ai: {
        defaultProviderId: 'ollama-local',
        providers: [
          {
            id: 'ollama-local',
            label: 'Local Ollama',
            endpoint: 'http://localhost:11434'
          }
        ],
        defaultModelPresetId: 'quick',
        modelPresets: [
          {
            id: 'quick',
            label: 'Quick',
            model: 'llama3.1:8b'
          },
          {
            id: 'quality',
            label: 'Quality',
            model: 'gpt-oss:120b-cloud'
          }
        ]
      }
    };
  }

  function createBridge(electronBridge) {
    if (electronBridge && electronBridge.notes) {
      return {
        config: electronBridge.config || getFallbackConfig(),
        notes: electronBridge.notes
      };
    }

    return {
      config: getFallbackConfig(),
      notes: globalScope.FolioBrowserNotesBridge
    };
  }

  const api = {
    createBridge
  };

  globalScope.FolioHostBridge = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
