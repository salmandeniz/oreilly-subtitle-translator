// Background script for O'Reilly Subtitle Translator

console.log("O'Reilly Subtitle Translator: Background script loaded.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        const { text, targetLang } = request;
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data && data[0]) {
                    const translatedText = data[0].map(part => part[0]).join('');
                    sendResponse({ translatedText });
                } else {
                    sendResponse({ translatedText: text });
                }
            })
            .catch(error => {
                console.error('Translation error:', error);
                sendResponse({ error: error.message });
            });

        return true; // Will respond asynchronously
    }
});
