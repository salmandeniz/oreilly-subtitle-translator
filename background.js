// Background script for O'Reilly Subtitle Translator

console.log("O'Reilly Subtitle Translator: Background script loaded.");

// Translate using Gemini API
// Translate using Gemini API
async function translateWithGemini(text, targetLang, apiKey, model = 'gemini-1.5-flash-001', glossary = []) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let prompt = `Translate the following text to ${getLanguageName(targetLang)}. Only return the translated text, nothing else:\n\n${text}`;

    if (glossary && glossary.length > 0) {
        prompt += `\n\nIMPORTANT: Do NOT translate the following words/phrases, keep them exactly as they are: ${glossary.join(', ')}.`;
    }

    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Gemini API error (${response.status}):`, errorBody);
            throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text.trim();
        } else {
            console.error('Invalid Gemini response structure:', data);
            throw new Error('Invalid response from Gemini API');
        }
    } catch (error) {
        console.error('Gemini translation error:', error);
        throw error;
    }
}

function getLanguageName(code) {
    const languages = {
        'en': 'English',
        'tr': 'Turkish',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh': 'Chinese'
    };
    return languages[code] || code;
}

async function translateWithGoogleTranslate(text, targetLang, glossary = []) {
    let textToTranslate = text;
    const placeholders = {};

    // Apply glossary placeholders
    if (glossary && glossary.length > 0) {
        glossary.forEach((term, index) => {
            if (term && term.trim().length > 0) {
                // Use numeric-only placeholder to avoid translation
                const placeholder = `999${index}999`;
                const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi'); // Case-insensitive, whole word
                if (regex.test(textToTranslate)) {
                    placeholders[placeholder] = term;
                    textToTranslate = textToTranslate.replace(regex, placeholder);
                }
            }
        });
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Google Translate API error: ${response.status}`);
        }
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            let translatedText = data[0][0][0];

            // Restore placeholders
            Object.keys(placeholders).forEach(placeholder => {
                const originalTerm = placeholders[placeholder];
                // Replace all occurrences of the placeholder
                const regex = new RegExp(escapeRegExp(placeholder), 'g');
                translatedText = translatedText.replace(regex, originalTerm);
            });

            return translatedText;
        } else {
            throw new Error('Invalid response from Google Translate API');
        }
    } catch (error) {
        console.error('Google Translate error:', error);
        throw error;
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Main message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        const { text, targetLang } = request;

        // Get API key, model, provider, and glossary from storage
        chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'translationProvider', 'glossary'], async (result) => {
            const apiKey = result.geminiApiKey;
            let model = result.geminiModel || 'gemini-1.5-flash-001';
            const providerSetting = result.translationProvider || 'auto';

            // Parse glossary
            let glossary = [];
            if (result.glossary) {
                glossary = result.glossary.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }

            console.log('Background: Settings loaded', { model, providerSetting, hasKey: !!apiKey, glossary });

            // Fix for legacy/invalid model name
            if (model === 'gemini-1.5-flash') {
                model = 'gemini-1.5-flash-001';
            }

            let translatedText = text;
            let provider = 'none';

            try {
                if (providerSetting === 'google') {
                    // Force Google Translate
                    console.log('⚡ Using Google Translate (forced by user)');
                    translatedText = await translateWithGoogleTranslate(text, targetLang, glossary);
                    provider = 'google';
                } else if (providerSetting === 'gemini') {
                    // Force Gemini
                    if (apiKey && apiKey.trim().length > 0) {
                        console.log(`🤖 Using Gemini AI (${model}) (forced by user)...`);
                        translatedText = await translateWithGemini(text, targetLang, apiKey, model, glossary);
                        provider = 'gemini';
                        console.log('✅ Translated with Gemini AI');
                    } else {
                        throw new Error('Gemini API key is missing');
                    }
                } else {
                    // Auto mode (default)
                    if (apiKey && apiKey.trim().length > 0) {
                        // Try Gemini API first
                        try {
                            console.log(`🤖 Using Gemini AI (${model}) for translation...`);
                            translatedText = await translateWithGemini(text, targetLang, apiKey, model, glossary);
                            provider = 'gemini';
                            console.log('✅ Translated with Gemini AI');
                        } catch (geminiError) {
                            console.warn('❌ Gemini API failed, falling back to Google Translate:', geminiError);
                            translatedText = await translateWithGoogleTranslate(text, targetLang, glossary);
                            provider = 'google';
                            console.log('⚡ Using Google Translate (fallback)');
                        }
                    } else {
                        // Use Google Translate as fallback
                        console.log('⚡ Using Google Translate (no API key configured)');
                        translatedText = await translateWithGoogleTranslate(text, targetLang, glossary);
                        provider = 'google';
                    }
                }

                sendResponse({ translatedText, provider });
            } catch (error) {
                console.error('Translation error:', error);
                sendResponse({ translatedText: text, error: error.message, provider: 'error' });
            }
        });

        return true; // Will respond asynchronously
    }
});
