// Popup script
document.addEventListener('DOMContentLoaded', () => {
    const targetLangSelect = document.getElementById('targetLang');
    const enableTranslationCheckbox = document.getElementById('enableTranslation');
    const saveBtn = document.getElementById('saveBtn');

    // Load settings
    chrome.storage.sync.get(['targetLang', 'enabled'], (result) => {
        if (result.targetLang) {
            targetLangSelect.value = result.targetLang;
        }
        if (result.enabled !== undefined) {
            enableTranslationCheckbox.checked = result.enabled;
        }
    });

    // Save settings
    saveBtn.addEventListener('click', () => {
        const targetLang = targetLangSelect.value;
        const enabled = enableTranslationCheckbox.checked;
        const status = document.getElementById('status');

        chrome.storage.sync.set({ targetLang, enabled }, () => {
            status.textContent = 'Settings saved!';
            setTimeout(() => {
                status.textContent = '';
                // Notify content script to update settings
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateSettings', settings: { targetLang, enabled } });
                    }
                });
                window.close();
            }, 2000);
        });
    });
});
