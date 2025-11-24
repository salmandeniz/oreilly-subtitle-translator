const content = require('../content.js');

describe('Content Script', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    describe('createOverlay', () => {
        test('creates overlay element if it does not exist', () => {
            const overlay = content.createOverlay();
            expect(overlay).toBeTruthy();
            expect(overlay.id).toBe('oreilly-subtitle-overlay');
            expect(document.getElementById('oreilly-subtitle-overlay')).toBeTruthy();
        });

        test('reuses existing overlay', () => {
            const firstOverlay = content.createOverlay();
            const secondOverlay = content.createOverlay();
            expect(firstOverlay).toBe(secondOverlay);
            expect(document.querySelectorAll('#oreilly-subtitle-overlay').length).toBe(1);
        });
    });

    describe('translateText', () => {
        test('sends message to background script', async () => {
            const mockResponse = { translatedText: 'Merhaba', provider: 'gemini' };

            // Mock chrome.runtime.sendMessage
            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });

            const result = await content.translateText('Hello');

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'translate', text: 'Hello' }),
                expect.any(Function)
            );
            expect(result).toEqual({ translatedText: 'Merhaba', provider: 'gemini', error: undefined });
        });

        test('handles runtime error', async () => {
            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                chrome.runtime.lastError = { message: 'Error' };
                callback(null);
                delete chrome.runtime.lastError;
            });

            const result = await content.translateText('Hello');

            expect(result).toEqual({ translatedText: 'Hello', provider: 'error' });
        });
    });
});
