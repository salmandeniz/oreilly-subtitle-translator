const background = require('../background.js');

describe('Background Script', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    describe('getLanguageName', () => {
        test('returns correct language name for code', () => {
            expect(background.getLanguageName('en')).toBe('English');
            expect(background.getLanguageName('tr')).toBe('Turkish');
        });

        test('returns code if language not found', () => {
            expect(background.getLanguageName('xyz')).toBe('xyz');
        });
    });

    describe('translateWithGemini', () => {
        test('calls Gemini API with correct parameters', async () => {
            const mockResponse = {
                candidates: [{
                    content: {
                        parts: [{ text: 'Merhaba Dünya' }]
                    }
                }]
            };

            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            const result = await background.translateWithGemini('Hello World', 'tr', 'fake-api-key');

            expect(result).toBe('Merhaba Dünya');
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: expect.stringContaining('Hello World')
                })
            );
        });

        test('handles API error', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => 'Bad Request'
            });

            await expect(background.translateWithGemini('Hello', 'tr', 'key'))
                .rejects.toThrow('Gemini API error: 400 - Bad Request');
        });
    });

    describe('translateWithGoogleTranslate', () => {
        test('calls Google Translate API with correct parameters', async () => {
            const mockResponse = [[['Merhaba Dünya']]];

            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            const result = await background.translateWithGoogleTranslate('Hello World', 'tr');

            expect(result).toBe('Merhaba Dünya');
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=Hello%20World'),
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        test('handles glossary replacements', async () => {
            const mockResponse = [[['9990999 Dünya']]]; // API returns placeholder

            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            const glossary = ['Hello'];
            const result = await background.translateWithGoogleTranslate('Hello World', 'tr', glossary);

            // Should replace 'Hello' with placeholder before sending, and restore it after
            expect(result).toBe('Hello Dünya');
        });

        test('handles API error', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(background.translateWithGoogleTranslate('Hello', 'tr'))
                .rejects.toThrow('Google Translate API error: 500');
        });
    });

    describe('handleMessage', () => {
        test('handles translate action with auto provider (Gemini success)', async () => {
            const sendResponse = jest.fn();
            const request = { action: 'translate', text: 'Hello', targetLang: 'tr' };

            // Mock storage
            chrome.storage.sync.get.mockImplementation((keys, callback) => {
                callback({ geminiApiKey: 'key', translationProvider: 'auto' });
            });

            // Mock Gemini success
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ candidates: [{ content: { parts: [{ text: 'Merhaba' }] } }] })
            });

            await background.handleMessage(request, {}, sendResponse);

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(sendResponse).toHaveBeenCalledWith({ translatedText: 'Merhaba', provider: 'gemini' });
        });

        test('handles translate action with auto provider (Gemini fail -> Google fallback)', async () => {
            const sendResponse = jest.fn();
            const request = { action: 'translate', text: 'Hello', targetLang: 'tr' };

            // Mock storage
            chrome.storage.sync.get.mockImplementation((keys, callback) => {
                callback({ geminiApiKey: 'key', translationProvider: 'auto' });
            });

            // Mock Gemini fail then Google success
            global.fetch
                .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Error' }) // Gemini
                .mockResolvedValueOnce({ ok: true, json: async () => [[['Merhaba']]] }); // Google

            await background.handleMessage(request, {}, sendResponse);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(sendResponse).toHaveBeenCalledWith({ translatedText: 'Merhaba', provider: 'google' });
        });
    });
});
