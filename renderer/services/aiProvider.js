(function attachAiProvider(globalScope) {
  function createAIProvider({ hostBridge }) {
    const config = hostBridge.config.ai;
    let activePresetId = config.defaultModelPresetId;

    function getProvider() {
      return config.providers.find((provider) => provider.id === config.defaultProviderId) || config.providers[0];
    }

    function getActivePreset() {
      return config.modelPresets.find((preset) => preset.id === activePresetId) || config.modelPresets[0];
    }

    async function fetchJson(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return response.json();
    }

    async function isAvailable() {
      try {
        await fetchJson(`${getProvider().endpoint}/api/tags`);
        return true;
      } catch {
        return false;
      }
    }

    async function ensureModelReady(onStatus) {
      const provider = getProvider();
      const preset = getActivePreset();
      const listData = await fetchJson(`${provider.endpoint}/api/tags`);
      const exists = listData.models?.some((model) => model.name.startsWith(preset.model.split(':')[0]));
      if (exists) {
        return true;
      }

      if (typeof onStatus === 'function') {
        onStatus(`Downloading ${preset.label} model...`);
      }

      await fetchJson(`${provider.endpoint}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: preset.model, stream: false })
      });

      return true;
    }

    async function streamChat(messages, onChunk) {
      const provider = getProvider();
      const preset = getActivePreset();
      const response = await fetch(`${provider.endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: preset.model,
          messages,
          stream: true
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          return fullText;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const payload = JSON.parse(line);
          if (payload.message?.content) {
            fullText += payload.message.content;
            if (typeof onChunk === 'function') {
              onChunk(fullText);
            }
          }
        }
      }
    }

    return {
      getProviderLabel() {
        return getProvider().label;
      },

      getModelPresets() {
        return config.modelPresets;
      },

      getActivePresetId() {
        return activePresetId;
      },

      getActivePreset() {
        return getActivePreset();
      },

      setActivePresetId(nextPresetId) {
        activePresetId = nextPresetId;
      },

      isAvailable,

      ensureModelReady,

      async rewriteSelection(instruction, selectedText, onChunk) {
        return streamChat(
          [
            { role: 'system', content: 'Output only the replacement text. No explanation.' },
            { role: 'user', content: `${instruction}: "${selectedText}"` }
          ],
          onChunk
        );
      },

      async chat(noteContext, query, onChunk) {
        return streamChat(
          [
            { role: 'system', content: 'You are a helpful writing assistant.' },
            { role: 'user', content: `Context: ${noteContext}\n\nQuestion: ${query}` }
          ],
          onChunk
        );
      }
    };
  }

  const api = {
    createAIProvider
  };

  globalScope.FolioAI = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
