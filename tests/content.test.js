const content = require('../content.js');

describe('Content Script', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
        // Reset global variables in content.js if possible, or just rely on function calls
        // Since we can't easily reset module-level variables without reloading the module,
        // we will try to set up the state via the exported functions or by mocking storage.
    });

    describe('createOverlay', () => {
        test('creates overlay element if it does not exist', () => {
            const overlay = content.createOverlay();
            expect(overlay).toBeTruthy();
            expect(overlay.id).toBe('oreilly-subtitle-overlay');
        });
    });

    describe('translateText', () => {
        test('sends message to background script', async () => {
            const mockResponse = { translatedText: 'Merhaba', provider: 'gemini' };
            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback(mockResponse);
            });

            const result = await content.translateText('Hello');
            expect(result).toEqual({ translatedText: 'Merhaba', provider: 'gemini', error: undefined });
        });
    });

    describe('showInteractiveSubtitle', () => {
        test('creates interactive words', () => {
            // We need to ensure translationEnabled is true. 
            // Since it's a module-level variable, we might need to simulate the settings update.
            // However, we can't easily access the listener.
            // But showInteractiveSubtitle checks translationEnabled.
            // By default it is true in the file.

            content.showInteractiveSubtitle('Hello World', 'Merhaba Dünya');

            const overlay = document.getElementById('oreilly-subtitle-overlay');
            expect(overlay).toBeTruthy();

            const words = overlay.querySelectorAll('.interactive-word');
            expect(words.length).toBe(2);
            expect(words[0].textContent).toBe('Hello');
            expect(words[1].textContent).toBe('World');

            const translated = overlay.querySelector('.oreilly-translated-subtitle');
            expect(translated).toBeTruthy();
            expect(translated.textContent).toBe('Merhaba Dünya');
        });
    });

    describe('handleWordClick', () => {
        test('shows tooltip with translation', async () => {
            const mockEvent = {
                target: document.createElement('span'),
                preventDefault: jest.fn()
            };
            document.body.appendChild(mockEvent.target); // Needs to be in DOM for getBoundingClientRect

            // Mock translateText result
            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback({ translatedText: 'Merhaba', provider: 'gemini' });
            });

            await content.handleWordClick(mockEvent, 'Hello');

            const tooltip = document.querySelector('.oreilly-translation-tooltip');
            expect(tooltip).toBeTruthy();
            expect(tooltip.textContent).toBe('Merhaba');
        });
    });

    describe('handleWordRightClick', () => {
        test('toggles unknown status and updates storage', () => {
            const mockEvent = {
                preventDefault: jest.fn(),
                target: document.createElement('span')
            };
            mockEvent.target.className = 'interactive-word';
            mockEvent.target.textContent = 'hello';

            content.handleWordRightClick(mockEvent, 'Hello');

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockEvent.target.className).toContain('unknown');
            expect(chrome.storage.sync.set).toHaveBeenCalledWith(
                expect.objectContaining({ unknownWords: expect.arrayContaining(['hello']) })
            );

            // Toggle back
            content.handleWordRightClick(mockEvent, 'Hello');
            expect(mockEvent.target.className).not.toContain('unknown');
        });
    });

    describe('checkNode', () => {
        test('detects subtitle class and updates display', async () => {
            const node = document.createElement('div');
            node.className = 'caption';
            node.textContent = 'Subtitle Text';

            // Mock translateText
            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback({ translatedText: 'Translated', provider: 'gemini' });
            });

            await content.checkNode(node);

            expect(node.style.visibility).toBe('hidden');
            // Should have called showInteractiveSubtitle, checking DOM
            const overlay = document.getElementById('oreilly-subtitle-overlay');
            expect(overlay).toBeTruthy();
            expect(overlay.textContent).toContain('Subtitle');
        });
    });
});
