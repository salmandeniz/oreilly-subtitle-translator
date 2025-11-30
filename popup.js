// Popup script
document.addEventListener('DOMContentLoaded', () => {
    const targetLangSelect = document.getElementById('targetLang');
    const enableTranslationCheckbox = document.getElementById('enableTranslation');
    const apiKeyInput = document.getElementById('apiKey');
    const toggleApiKeyBtn = document.getElementById('toggleApiKey');
    const providerStatus = document.getElementById('providerStatus');
    const saveBtn = document.getElementById('saveBtn');

    const providerSelect = document.getElementById('provider');
    const glossaryInput = document.getElementById('glossary');
    const geminiConfig = document.getElementById('geminiConfig');
    const geminiModelSelect = document.getElementById('geminiModel');
    const refreshModelsBtn = document.getElementById('refreshModelsBtn');

    const showTranslatedSubtitleCheckbox = document.getElementById('showTranslatedSubtitle');
    const unknownWordsList = document.getElementById('unknownWordsList');
    const clearUnknownWordsBtn = document.getElementById('clearUnknownWordsBtn');
    const mergeDelaySlider = document.getElementById('mergeDelay');
    const mergeDelayValue = document.getElementById('mergeDelayValue');

    let unknownWords = [];

    mergeDelaySlider.addEventListener('input', () => {
        mergeDelayValue.textContent = mergeDelaySlider.value;
    });

    // Load settings
    chrome.storage.sync.get(['targetLang', 'enabled', 'geminiApiKey', 'geminiModel', 'translationProvider', 'glossary', 'showTranslatedSubtitle', 'unknownWords', 'mergeDelay'], (result) => {
        if (result.targetLang) {
            targetLangSelect.value = result.targetLang;
        }
        if (result.enabled !== undefined) {
            enableTranslationCheckbox.checked = result.enabled;
        }
        if (result.showTranslatedSubtitle !== undefined) {
            showTranslatedSubtitleCheckbox.checked = result.showTranslatedSubtitle;
        }
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
        if (result.translationProvider) {
            providerSelect.value = result.translationProvider;
        }
        if (result.glossary) {
            glossaryInput.value = result.glossary;
        }
        if (result.unknownWords) {
            unknownWords = result.unknownWords;
            renderUnknownWords();
        }
        if (result.mergeDelay !== undefined) {
            mergeDelaySlider.value = result.mergeDelay;
            mergeDelayValue.textContent = result.mergeDelay;
        }

        // Toggle Gemini config visibility
        toggleGeminiConfig(providerSelect.value);

        // Populate model dropdown if saved, otherwise default
        if (result.geminiModel) {
            // Check if the saved model is already in the list (it's just the default one initially)
            // If we have a saved model that isn't the default, add it as an option
            if (result.geminiModel !== 'gemini-1.5-flash-001') {
                const option = document.createElement('option');
                option.value = result.geminiModel;
                option.textContent = result.geminiModel;
                geminiModelSelect.appendChild(option);
            }
            geminiModelSelect.value = result.geminiModel;
        }

        updateProviderStatus(result.geminiApiKey, providerSelect.value);
    });

    // Toggle Gemini Config Visibility
    function toggleGeminiConfig(provider) {
        if (provider === 'google') {
            geminiConfig.style.display = 'none';
        } else {
            geminiConfig.style.display = 'block';
        }
    }

    // Provider change listener
    providerSelect.addEventListener('change', () => {
        toggleGeminiConfig(providerSelect.value);
        updateProviderStatus(apiKeyInput.value, providerSelect.value);
    });

    // Toggle API key visibility
    toggleApiKeyBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiKeyBtn.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKeyBtn.textContent = '👁️';
        }
    });

    // Fetch Models
    refreshModelsBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            testStatus.textContent = 'Please enter an API key first.';
            testStatus.style.color = '#fbbf24';
            return;
        }

        refreshModelsBtn.disabled = true;
        refreshModelsBtn.textContent = '⏳';
        testStatus.textContent = 'Fetching models...';
        testStatus.style.color = '#ccc';

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch models (${response.status})`);
            }

            const data = await response.json();

            if (data.models) {
                // Filter for generateContent supported models and clear existing
                geminiModelSelect.innerHTML = '';

                const supportedModels = data.models.filter(m =>
                    m.supportedGenerationMethods &&
                    m.supportedGenerationMethods.includes('generateContent')
                );

                if (supportedModels.length === 0) {
                    const option = document.createElement('option');
                    option.value = 'gemini-1.5-flash-001';
                    option.textContent = 'gemini-1.5-flash-001 (Default)';
                    geminiModelSelect.appendChild(option);
                    testStatus.textContent = '⚠️ No compatible models found. Using default.';
                    testStatus.style.color = '#fbbf24';
                } else {
                    supportedModels.forEach(model => {
                        const option = document.createElement('option');
                        // model.name is like "models/gemini-1.5-flash"
                        const modelId = model.name.replace('models/', '');
                        option.value = modelId;
                        option.textContent = `${model.displayName || modelId} (${modelId})`;
                        geminiModelSelect.appendChild(option);
                    });

                    testStatus.textContent = `✅ Found ${supportedModels.length} models.`;
                    testStatus.style.color = '#4ade80';
                }
            }
        } catch (error) {
            testStatus.textContent = `❌ Error fetching models: ${error.message}`;
            testStatus.style.color = '#ef4444';
        } finally {
            refreshModelsBtn.disabled = false;
            refreshModelsBtn.textContent = '🔄';
        }
    });

    // Update provider status
    function updateProviderStatus(apiKey, provider = 'auto') {
        providerStatus.className = 'provider-status';

        if (provider === 'google') {
            providerStatus.textContent = '⚡ Using Google Translate';
            providerStatus.classList.add('google');
        } else if (provider === 'gemini') {
            if (apiKey && apiKey.trim().length > 0) {
                providerStatus.textContent = '✨ Using Gemini AI';
                providerStatus.classList.add('gemini');
            } else {
                providerStatus.textContent = '⚠️ Gemini AI (Missing Key)';
                providerStatus.style.color = '#fbbf24';
            }
        } else { // Auto
            if (apiKey && apiKey.trim().length > 0) {
                providerStatus.textContent = '✨ Auto (Gemini AI)';
                providerStatus.classList.add('gemini');
            } else {
                providerStatus.textContent = '⚡ Auto (Google Translate)';
                providerStatus.classList.add('google');
            }
        }
    }

    // Update status when API key changes
    apiKeyInput.addEventListener('input', () => {
        updateProviderStatus(apiKeyInput.value, providerSelect.value);
    });

    // Test Connection
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    const testStatus = document.getElementById('testStatus');

    testConnectionBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const model = geminiModelSelect.value;

        if (!apiKey) {
            testStatus.textContent = 'Please enter an API key first.';
            testStatus.style.color = '#fbbf24';
            return;
        }

        testStatus.textContent = `Testing with ${model}...`;
        testStatus.style.color = '#ccc';
        testConnectionBtn.disabled = true;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const requestBody = {
                contents: [{
                    parts: [{
                        text: "Translate 'Hello' to Spanish. Only return the translated text."
                    }]
                }]
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API Error (${response.status}): ${errorBody}`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                testStatus.textContent = '✅ Success! Connection working & Saved.';
                testStatus.style.color = '#4ade80';

                // Auto-save settings on success
                const targetLang = targetLangSelect.value;
                const enabled = enableTranslationCheckbox.checked;
                const showTranslatedSubtitle = showTranslatedSubtitleCheckbox.checked;
                const provider = providerSelect.value;
                const glossary = glossaryInput.value;
                chrome.storage.sync.set({ targetLang, enabled, showTranslatedSubtitle, geminiApiKey: apiKey, geminiModel: model, translationProvider: provider, glossary }, () => {
                    console.log('Settings auto-saved after successful test');
                    // Notify content script
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: 'updateSettings',
                                settings: { targetLang, enabled, showTranslatedSubtitle }
                            });
                        }
                    });
                });
            } else {
                throw new Error('Invalid response structure from API');
            }
        } catch (error) {
            let errorMessage = error.message;
            if (error.name === 'AbortError') {
                errorMessage = 'Request timed out. Check your internet connection.';
            }
            testStatus.textContent = `❌ Error: ${errorMessage}`;
            testStatus.style.color = '#ef4444';
        } finally {
            testConnectionBtn.disabled = false;
        }
    });

    // Save settings helper
    function saveSettings() {
        const targetLang = targetLangSelect.value;
        const enabled = enableTranslationCheckbox.checked;
        const showTranslatedSubtitle = showTranslatedSubtitleCheckbox.checked;
        const geminiApiKey = apiKeyInput.value.trim();
        const geminiModel = geminiModelSelect.value;
        const translationProvider = providerSelect.value;
        const glossary = glossaryInput.value;
        const mergeDelay = parseInt(mergeDelaySlider.value, 10);
        const status = document.getElementById('status');

        chrome.storage.sync.set({ targetLang, enabled, showTranslatedSubtitle, geminiApiKey, geminiModel, translationProvider, glossary, mergeDelay }, () => {
            // Only show status if triggered by button
            if (status) {
                status.textContent = 'Settings saved!';
                setTimeout(() => {
                    status.textContent = '';
                }, 2000);
            }

            // Notify content script to update settings
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'updateSettings',
                        settings: { targetLang, enabled, showTranslatedSubtitle, mergeDelay }
                    });
                }
            });
        });
    }

    // Auto-save on toggle
    enableTranslationCheckbox.addEventListener('change', saveSettings);
    showTranslatedSubtitleCheckbox.addEventListener('change', saveSettings);
    mergeDelaySlider.addEventListener('change', saveSettings);

    // Save settings button
    saveBtn.addEventListener('click', () => {
        saveSettings();
        setTimeout(() => window.close(), 500); // Close after short delay
    });

    // Unknown words management
    function renderUnknownWords() {
        unknownWordsList.innerHTML = '';

        if (unknownWords.length === 0) {
            return; // CSS will show "No unknown words yet"
        }

        unknownWords.sort().forEach(word => {
            const chip = document.createElement('div');
            chip.className = 'word-chip';

            const wordText = document.createElement('span');
            wordText.textContent = word;

            const removeBtn = document.createElement('span');
            removeBtn.className = 'word-chip-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = () => removeUnknownWord(word);

            chip.appendChild(wordText);
            chip.appendChild(removeBtn);
            unknownWordsList.appendChild(chip);
        });
    }

    function removeUnknownWord(word) {
        unknownWords = unknownWords.filter(w => w !== word);
        chrome.storage.sync.set({ unknownWords });
        renderUnknownWords();

        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'updateUnknownWords',
                    unknownWords: unknownWords
                });
            }
        });
    }

    clearUnknownWordsBtn.addEventListener('click', () => {
        if (unknownWords.length === 0) return;

        if (confirm('Clear all unknown words?')) {
            unknownWords = [];
            chrome.storage.sync.set({ unknownWords });
            renderUnknownWords();

            // Notify content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'updateUnknownWords',
                        unknownWords: []
                    });
                }
            });
        }
    });
});
