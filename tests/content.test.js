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
            expect(mockEvent.target.classList.contains('single-selected')).toBe(true);
        });

        test('Cmd+click accumulates words and translates combined text', async () => {
            const firstTarget = document.createElement('span');
            const secondTarget = document.createElement('span');
            document.body.appendChild(firstTarget);
            document.body.appendChild(secondTarget);

            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback({ translatedText: `tr:${message.text}`, provider: 'gemini' });
            });

            await content.handleWordClick({ target: firstTarget, metaKey: true }, 'Hello');
            await content.handleWordClick({ target: secondTarget, metaKey: true }, 'World');

            expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
                expect.objectContaining({ text: 'hello world' }),
                expect.any(Function)
            );

            const tooltip = document.querySelector('.oreilly-translation-tooltip');
            expect(tooltip).toBeTruthy();
            expect(tooltip.textContent).toBe('tr:hello world');
            expect(firstTarget.classList.contains('multi-selected')).toBe(true);
            expect(secondTarget.classList.contains('multi-selected')).toBe(true);
        });

        test('clicking outside clears single and multi selections', async () => {
            const singleTarget = document.createElement('span');
            document.body.appendChild(singleTarget);

            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback({ translatedText: message.text, provider: 'gemini' });
            });

            await content.handleWordClick({ target: singleTarget }, 'Hello');
            expect(singleTarget.classList.contains('single-selected')).toBe(true);

            const multiFirst = document.createElement('span');
            const multiSecond = document.createElement('span');
            document.body.appendChild(multiFirst);
            document.body.appendChild(multiSecond);

            await content.handleWordClick({ target: multiFirst, metaKey: true }, 'Foo');
            await content.handleWordClick({ target: multiSecond, metaKey: true }, 'Bar');
            expect(multiFirst.classList.contains('multi-selected')).toBe(true);
            expect(multiSecond.classList.contains('multi-selected')).toBe(true);

            const outside = document.createElement('div');
            document.body.appendChild(outside);
            outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(singleTarget.classList.contains('single-selected')).toBe(false);
            expect(multiFirst.classList.contains('multi-selected')).toBe(false);
            expect(multiSecond.classList.contains('multi-selected')).toBe(false);
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
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('detects subtitle class and updates display', async () => {
            const node = document.createElement('div');
            node.className = 'caption';
            node.textContent = 'Subtitle Text';

            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback({ translatedText: 'Translated', provider: 'gemini' });
            });

            content.checkNode(node);

            expect(node.style.visibility).toBe('hidden');

            jest.advanceTimersByTime(400);
            await Promise.resolve();

            const overlay = document.getElementById('oreilly-subtitle-overlay');
            expect(overlay).toBeTruthy();
            expect(overlay.textContent).toContain('Subtitle');
        });
    });

    describe('handleWordHover', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            content.translationCache = {};
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('given_cachedTranslation_when_hover_then_showsTooltipImmediately', async () => {
            const mockEvent = {
                target: document.createElement('span')
            };
            document.body.appendChild(mockEvent.target);
            content.translationCache['hello'] = 'merhaba';

            content.handleWordHover(mockEvent, 'Hello');
            jest.advanceTimersByTime(300);

            const tooltip = document.querySelector('.oreilly-translation-tooltip');
            expect(tooltip).toBeTruthy();
            expect(tooltip.textContent).toBe('merhaba');
        });

        test('given_noCachedTranslation_when_hover_then_fetchesAndCachesTranslation', async () => {
            jest.useRealTimers();

            const mockEvent = {
                target: document.createElement('span')
            };
            document.body.appendChild(mockEvent.target);

            chrome.runtime.sendMessage.mockImplementation((message, callback) => {
                callback({ translatedText: 'mundo', provider: 'gemini' });
            });

            content.handleWordHover(mockEvent, 'World');

            await new Promise(r => setTimeout(r, 350));

            expect(content.translationCache['world']).toBe('mundo');
        });

        test('given_hoverWithDebounce_when_mouseLeaveBeforeTimeout_then_noTooltipShown', () => {
            const mockEvent = {
                target: document.createElement('span')
            };
            document.body.appendChild(mockEvent.target);

            content.handleWordHover(mockEvent, 'Hello');
            jest.advanceTimersByTime(100);
            content.handleWordHoverEnd();
            jest.advanceTimersByTime(300);

            const tooltip = document.querySelector('.oreilly-translation-tooltip');
            expect(tooltip).toBeFalsy();
        });
    });

    describe('handleWordHoverEnd', () => {
        test('given_tooltipVisible_when_hoverEnd_then_hidesAndRemovesTooltip', () => {
            const tooltip = document.createElement('div');
            tooltip.className = 'oreilly-translation-tooltip';
            document.body.appendChild(tooltip);

            content.handleWordHoverEnd();

            const remainingTooltip = document.querySelector('.oreilly-translation-tooltip');
            expect(remainingTooltip).toBeFalsy();
        });
    });

    describe('hideTooltip', () => {
        test('given_tooltipExists_when_hideTooltip_then_removesFromDom', () => {
            const tooltip = document.createElement('div');
            tooltip.className = 'oreilly-translation-tooltip';
            document.body.appendChild(tooltip);

            content.hideTooltip();

            expect(document.querySelector('.oreilly-translation-tooltip')).toBeFalsy();
        });
    });

    describe('showInteractiveSubtitle with unknown words hover', () => {
        beforeEach(() => {
            chrome.storage.sync.set({ unknownWords: ['hello'] });
        });

        test('given_unknownWord_when_showInteractiveSubtitle_then_hasHoverListeners', () => {
            content.handleWordRightClick({
                preventDefault: jest.fn(),
                target: document.createElement('span')
            }, 'Hello');

            content.showInteractiveSubtitle('Hello World', null);

            const overlay = document.getElementById('oreilly-subtitle-overlay');
            const words = overlay.querySelectorAll('.interactive-word');
            const helloWord = Array.from(words).find(w => w.textContent === 'Hello');

            expect(helloWord.className).toContain('unknown');
            expect(helloWord.onmouseenter).toBeTruthy();
            expect(helloWord.onmouseleave).toBeTruthy();
        });

        test('given_regularWord_when_showInteractiveSubtitle_then_noHoverListeners', () => {
            content.showInteractiveSubtitle('World', null);

            const overlay = document.getElementById('oreilly-subtitle-overlay');
            const words = overlay.querySelectorAll('.interactive-word');
            const worldWord = Array.from(words).find(w => w.textContent === 'World');

            expect(worldWord.className).not.toContain('unknown');
            expect(worldWord.onmouseenter).toBeFalsy();
            expect(worldWord.onmouseleave).toBeFalsy();
        });
    });

    describe('addToGlossary', () => {
        beforeEach(() => {
            content.glossary = '';
        });

        test('given_emptyGlossary_when_addWord_then_addsWordToGlossary', () => {
            content.addToGlossary('react');

            expect(content.glossary).toBe('react');
            expect(chrome.storage.sync.set).toHaveBeenCalledWith({ glossary: 'react' });
        });

        test('given_existingGlossary_when_addWord_then_appendsWord', () => {
            content.glossary = 'react, state';

            content.addToGlossary('props');

            expect(content.glossary).toBe('react, state, props');
            expect(chrome.storage.sync.set).toHaveBeenCalledWith({ glossary: 'react, state, props' });
        });

        test('given_wordAlreadyInGlossary_when_addWord_then_removesFromGlossary', () => {
            content.glossary = 'react, state';

            content.addToGlossary('react');

            expect(content.glossary).toBe('state');
            expect(chrome.storage.sync.set).toHaveBeenCalledWith({ glossary: 'state' });
        });
    });

    describe('handleWordRightClick with Cmd key', () => {
        test('given_cmdKeyPressed_when_rightClick_then_addsToGlossary', () => {
            content.glossary = '';
            const mockEvent = {
                preventDefault: jest.fn(),
                metaKey: true,
                target: document.createElement('span')
            };
            mockEvent.target.className = 'interactive-word';
            mockEvent.target.textContent = 'hello';

            content.handleWordRightClick(mockEvent, 'Hello');

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(content.glossary).toBe('hello');
            expect(chrome.storage.sync.set).toHaveBeenCalledWith({ glossary: 'hello' });
        });

        test('given_noCmdKey_when_rightClick_then_togglesUnknownStatus', () => {
            const mockEvent = {
                preventDefault: jest.fn(),
                metaKey: false,
                target: document.createElement('span')
            };
            mockEvent.target.className = 'interactive-word';
            mockEvent.target.textContent = 'newword';

            content.handleWordRightClick(mockEvent, 'NewWord');

            expect(mockEvent.target.className).toContain('unknown');
            expect(chrome.storage.sync.set).toHaveBeenCalledWith(
                expect.objectContaining({ unknownWords: expect.arrayContaining(['newword']) })
            );
        });
    });
});
