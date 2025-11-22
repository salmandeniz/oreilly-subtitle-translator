// Background script for O'Reilly Subtitle Translator

console.log("O'Reilly Subtitle Translator: Background script loaded.");

// Translate using Gemini API
// Translate using Gemini API
async function translateWithGemini(text, targetLang, apiKey, model = 'gemini-1.5-flash-001') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `Translate the following text to ${getLanguageName(targetLang)}. Only return the translated text, nothing else:\n\n${text}`;

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

async function translateWithGoogleTranslate(text, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

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
            return data[0][0][0];
        } else {
            throw new Error('Invalid response from Google Translate API');
        }
    } catch (error) {
        console.error('Google Translate error:', error);
        throw error;
    }
}

// Main message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        const { text, targetLang } = request;

        // Get API key, model, and provider from storage
        chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'translationProvider'], async (result) => {
            const apiKey = result.geminiApiKey;
            let model = result.geminiModel || 'gemini-1.5-flash-001';
            const providerSetting = result.translationProvider || 'auto';

            console.log('Background: Settings loaded', { model, providerSetting, hasKey: !!apiKey });

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
                    translatedText = await translateWithGoogleTranslate(text, targetLang);
                    provider = 'google';
                } else if (providerSetting === 'gemini') {
                    // Force Gemini
                    if (apiKey && apiKey.trim().length > 0) {
                        console.log(`🤖 Using Gemini AI (${model}) (forced by user)...`);
                        translatedText = await translateWithGemini(text, targetLang, apiKey, model);
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
                            translatedText = await translateWithGemini(text, targetLang, apiKey, model);
                            provider = 'gemini';
                            console.log('✅ Translated with Gemini AI');
                        } catch (geminiError) {
                            console.warn('❌ Gemini API failed, falling back to Google Translate:', geminiError);
                            translatedText = await translateWithGoogleTranslate(text, targetLang);
                            provider = 'google';
                            console.log('⚡ Using Google Translate (fallback)');
                        }
                    } else {
                        // Use Google Translate as fallback
                        console.log('⚡ Using Google Translate (no API key configured)');
                        translatedText = await translateWithGoogleTranslate(text, targetLang);
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
