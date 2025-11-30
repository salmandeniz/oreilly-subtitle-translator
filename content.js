// Content script for O'Reilly Subtitle Translator

console.log("O'Reilly Subtitle Translator: Content script loaded in " + window.location.href);

// Check if extension context is valid
function isExtensionContextValid() {
    try {
        return chrome.runtime && chrome.runtime.id;
    } catch (e) {
        return false;
    }
}

function clearSingleSelection(options = {}) {
    if (!singleSelectedElement) return;

    singleSelectedElement.classList.remove('single-selected');
    singleSelectedElement = null;

    if (!options.skipTooltip) {
        hideTooltip();
    }
}

let targetLang = 'tr';
let translationEnabled = true;
let showTranslatedSubtitle = false;
let currentSubtitleText = '';
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialLeft = 0;
let initialTop = 0;
let savedPosition = null;
let unknownWords = new Set();
let translationCache = {};
let hoverDebounceTimer = null;
let glossary = '';
let subtitleDebounceTimer = null;
let textTrackObserverActive = false;
let cueBuffer = '';
let cueBufferTimer = null;
let domSubtitleBuffer = '';
let lastDisplayedText = '';
let lastDisplayTime = 0;
let continuationThreshold = 5000;
let multiSelectSelection = [];
let singleSelectedElement = null;
let fontFamily = 'Segoe UI';
let fontSize = 18;
let translatedFontFamily = 'Segoe UI';
let translatedFontSize = 14;

function constrainOverlayToViewport() {
    const overlay = document.getElementById('oreilly-subtitle-overlay');
    if (!overlay || !savedPosition || savedPosition.topPercent === undefined) return;

    const viewportHeight = window.innerHeight;
    const overlayHeight = overlay.offsetHeight || 100;
    const calculatedTop = savedPosition.topPercent * viewportHeight;
    const maxTop = viewportHeight - overlayHeight;
    const constrainedTop = Math.max(0, Math.min(calculatedTop, maxTop));

    overlay.style.top = constrainedTop + 'px';
}

// Load settings
chrome.storage.sync.get(['targetLang', 'enabled', 'overlayPosition', 'showTranslatedSubtitle', 'unknownWords', 'glossary', 'mergeDelay', 'fontFamily', 'fontSize', 'translatedFontFamily', 'translatedFontSize'], (result) => {
    if (result.targetLang) targetLang = result.targetLang;
    if (result.enabled !== undefined) translationEnabled = result.enabled;
    if (result.showTranslatedSubtitle !== undefined) showTranslatedSubtitle = result.showTranslatedSubtitle;
    if (result.overlayPosition) savedPosition = result.overlayPosition;
    if (result.unknownWords) unknownWords = new Set(result.unknownWords);
    if (result.glossary) glossary = result.glossary;
    if (result.mergeDelay !== undefined) continuationThreshold = result.mergeDelay * 1000;
    if (result.fontFamily) fontFamily = result.fontFamily;
    if (result.fontSize !== undefined) fontSize = result.fontSize;
    if (result.translatedFontFamily) translatedFontFamily = result.translatedFontFamily;
    if (result.translatedFontSize !== undefined) translatedFontSize = result.translatedFontSize;
});

// Listen for settings updates
// Listen for settings updates
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
        console.log('Received updateSettings message:', request.settings);
        targetLang = request.settings.targetLang;
        translationEnabled = request.settings.enabled;
        if (request.settings.showTranslatedSubtitle !== undefined) {
            showTranslatedSubtitle = request.settings.showTranslatedSubtitle;
        }
        if (request.settings.unknownWords !== undefined) {
            unknownWords = new Set(request.settings.unknownWords);
        }
        if (request.settings.mergeDelay !== undefined) {
            continuationThreshold = request.settings.mergeDelay * 1000;
        }
        if (request.settings.fontFamily) {
            fontFamily = request.settings.fontFamily;
        }
        if (request.settings.fontSize !== undefined) {
            fontSize = request.settings.fontSize;
        }
        if (request.settings.translatedFontFamily) {
            translatedFontFamily = request.settings.translatedFontFamily;
        }
        if (request.settings.translatedFontSize !== undefined) {
            translatedFontSize = request.settings.translatedFontSize;
        }

        console.log('Current state:', { translationEnabled, showTranslatedSubtitle, currentSubtitleText, continuationThreshold });

        // Clear current overlay if disabled
        if (!translationEnabled) {
            removeOverlay();
            currentSubtitleText = ''; // Reset current text
        } else {
            console.log('Refreshing subtitle display...');

            if (currentSubtitleText) {
                // Scenario: Translation was already on, just changing display options
                console.log('Refreshing existing subtitle:', currentSubtitleText);

                if (showTranslatedSubtitle) {
                    // Show loading state immediately
                    showInteractiveSubtitle(currentSubtitleText, "Loading...");

                    const result = await translateText(currentSubtitleText);
                    if (result && result.translatedText) {
                        showInteractiveSubtitle(currentSubtitleText, result.translatedText);
                    } else {
                        // Fallback if translation failed or returned empty
                        showInteractiveSubtitle(currentSubtitleText, null);
                    }
                } else {
                    // Just show interactive words without translation
                    showInteractiveSubtitle(currentSubtitleText, null);
                }
            } else {
                // Scenario: Translation was off, or no subtitle tracked. Force a scan.
                console.log('No current subtitle tracked. Scanning for subtitles...');
                scanForSubtitles(document.body);
            }
        }
    } else if (request.action === 'updateUnknownWords') {
        console.log('Received updateUnknownWords message:', request.unknownWords);
        unknownWords = new Set(request.unknownWords);

        // Refresh the current subtitle display to update colors
        if (currentSubtitleText) {
            if (showTranslatedSubtitle) {
                const result = await translateText(currentSubtitleText);
                showInteractiveSubtitle(currentSubtitleText, result?.translatedText || null);
            } else {
                showInteractiveSubtitle(currentSubtitleText, null);
            }
        }
    }
});

// Create overlay element
function createOverlay() {
    let overlay = document.getElementById('oreilly-subtitle-overlay');

    // Find the best container for the overlay
    // 1. Try the current fullscreen element
    // 2. Try known player containers
    // 3. Try the parent of the first video element found
    // 4. Fallback to body
    let container = document.fullscreenElement ||
        document.querySelector('.kaltura-player-container') ||
        document.querySelector('.video-js') ||
        document.querySelector('#orm-kaltura-player');

    if (!container) {
        const video = document.querySelector('video');
        if (video) {
            container = video.parentElement;
        }
    }

    if (!container) {
        container = document.body;
    }

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'oreilly-subtitle-overlay';
        overlay.className = 'oreilly-subtitle-overlay';
        container.appendChild(overlay);
    } else {
        // If overlay exists but is not in the current fullscreen element (and we are in fullscreen), move it.
        if (document.fullscreenElement && overlay.parentElement !== document.fullscreenElement) {
            document.fullscreenElement.appendChild(overlay);
        } else if (!document.fullscreenElement && overlay.parentElement !== container && container !== document.body) {
            // Move back to player container if not in fullscreen
            container.appendChild(overlay);
        }
    }


    if (savedPosition && savedPosition.topPercent !== undefined) {
        const viewportHeight = window.innerHeight;
        const overlayHeight = overlay.offsetHeight || 100;
        const calculatedTop = savedPosition.topPercent * viewportHeight;
        const maxTop = viewportHeight - overlayHeight;
        const constrainedTop = Math.max(0, Math.min(calculatedTop, maxTop));

        overlay.style.position = 'fixed';
        overlay.style.left = '50%';
        overlay.style.top = constrainedTop + 'px';
        overlay.style.bottom = 'auto';
        overlay.style.transform = 'translateX(-50%)';
    } else if (container === document.body) {
        overlay.style.position = 'fixed';
        overlay.style.bottom = '100px'; // Higher up for fixed position to avoid bottom bars
        overlay.style.left = '50%';
        overlay.style.transform = 'translateX(-50%)';
    } else {
        overlay.style.position = 'absolute';
        overlay.style.bottom = '80px';
        overlay.style.left = '50%';
        overlay.style.transform = 'translateX(-50%)';
        // Ensure container has relative positioning if not body
        const style = window.getComputedStyle(container);
        if (style.position === 'static') {
            container.style.position = 'relative';
        }
    }

    console.log('Overlay created/updated in container:', container.tagName, container.className);

    // Add drag event listeners
    if (!overlay.hasAttribute('data-drag-initialized')) {
        overlay.setAttribute('data-drag-initialized', 'true');

        overlay.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragStartY = e.clientY;

            // Get initial position relative to viewport since we switch to fixed
            const rect = overlay.getBoundingClientRect();
            initialTop = rect.top;

            // Switch to fixed positioning immediately for smooth dragging
            overlay.style.position = 'fixed';
            overlay.style.left = '50%';
            overlay.style.top = initialTop + 'px';
            overlay.style.bottom = 'auto';
            overlay.style.transform = 'translateX(-50%)';
            overlay.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent selection

            const deltaY = e.clientY - dragStartY;

            overlay.style.top = (initialTop + deltaY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            overlay.style.cursor = 'move';

            const currentTop = parseInt(overlay.style.top, 10);
            const viewportHeight = window.innerHeight;
            savedPosition = {
                topPercent: currentTop / viewportHeight
            };
            chrome.storage.sync.set({ overlayPosition: savedPosition });
        });
    }

    return overlay;
}

// Listen for fullscreen changes to ensure overlay is in the right place
document.addEventListener('fullscreenchange', () => {
    const overlay = document.getElementById('oreilly-subtitle-overlay');
    if (overlay && currentSubtitleText) {
        createOverlay();
        constrainOverlayToViewport();
    }
});

window.addEventListener('resize', () => {
    constrainOverlayToViewport();
});

function removeOverlay() {
    const overlay = document.getElementById('oreilly-subtitle-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function clearMultiSelection(options = {}) {
    if (multiSelectSelection.length === 0) return;

    multiSelectSelection.forEach(({ element }) => {
        if (element && element.classList) {
            element.classList.remove('multi-selected');
        }
    });
    multiSelectSelection = [];

    if (!options.skipTooltip) {
        hideTooltip();
    }
}

function showTranslation(text, provider) {
    if (!translationEnabled || !text) return;

    const overlay = createOverlay();
    overlay.innerHTML = ''; // Clear previous content

    // Create wrapper for relative positioning
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.textContent = text;

    // Add provider badge
    if (provider) {
        const badge = document.createElement('div');
        badge.className = 'oreilly-provider-badge';
        if (provider === 'gemini') {
            badge.textContent = '🤖 AI';
            badge.style.backgroundColor = '#1a4d2e';
            badge.style.color = '#4ade80';
        } else if (provider === 'google') {
            badge.textContent = '⚡ GT';
            badge.style.backgroundColor = '#4a3d1a';
            badge.style.color = '#fbbf24';
        } else if (provider === 'error') {
            badge.textContent = '❌ ERR';
            badge.style.backgroundColor = '#4d1a1a';
            badge.style.color = '#f87171';
        }
        wrapper.appendChild(badge);
    }

    overlay.appendChild(wrapper);
    overlay.style.display = 'block';
    console.log('Overlay updated and displayed');
}

// Translation function using background script
async function translateText(text) {
    if (!text) return { translatedText: '', provider: 'none' };

    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ action: 'translate', text, targetLang }, (response) => {
                if (chrome.runtime.lastError) {
                    // Extension context invalidated or other runtime error
                    console.warn('Translation failed:', chrome.runtime.lastError.message);
                    resolve({ translatedText: text, provider: 'error' }); // Return original text
                } else if (response && response.translatedText) {
                    resolve({
                        translatedText: response.translatedText,
                        provider: response.provider,
                        error: response.error
                    });
                } else {
                    resolve({ translatedText: text, provider: 'error', error: 'Unknown response format' });
                }
            });
        } catch (error) {
            // Catch any synchronous errors
            console.warn('Translation error:', error);
            resolve({ translatedText: text, provider: 'error' });
        }
    });
}

// Observer for subtitles
// Recursive function to observe all Shadow DOMs
function observeShadowRoot(node) {
    if (!node) return;

    // If this node has a shadow root, observe it
    if (node.shadowRoot) {
        observeDOM(node.shadowRoot);
    }

    // Look for children with shadow roots
    node = node.firstChild;
    while (node) {
        observeShadowRoot(node);
        node = node.nextSibling;
    }
}

function observeDOM(targetNode) {
    const observer = new MutationObserver(async (mutations) => {
        // Check if extension context is still valid
        if (!isExtensionContextValid()) {
            console.warn('Extension context invalidated, stopping observer');
            observer.disconnect();
            return;
        }

        if (!translationEnabled) return;

        for (const mutation of mutations) {
            // Check added nodes for new shadow roots
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    observeShadowRoot(node);

                    // Also check if this node itself is a subtitle
                    checkNode(node);
                }
            });

            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                checkNode(mutation.target);
            }
        }
    });

    observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

async function checkNode(target) {
    let text = '';
    let isSubtitle = false;

    if (target.nodeType === Node.ELEMENT_NODE) {
        const className = target.className;
        // Check class names (handling both string and SVGAnimatedString)
        const classStr = typeof className === 'string' ? className : (className.baseVal || '');

        if (classStr &&
            !classStr.includes('oreilly-subtitle-overlay') && // Ignore our own overlay
            (classStr.includes('caption') ||
                classStr.includes('subtitle') ||
                classStr.includes('track') ||
                classStr.includes('cue') ||
                classStr.includes('playkit-text-track') ||
                classStr.includes('playkit-subtitle') ||
                classStr.includes('playkit-captions'))) {
            isSubtitle = true;
            text = target.innerText || target.textContent;
        }
    } else if (target.nodeType === Node.TEXT_NODE) {
        const parent = target.parentElement;
        if (parent) {
            const className = parent.className;
            const classStr = typeof className === 'string' ? className : (className.baseVal || '');

            if (classStr &&
                (classStr.includes('caption') ||
                    classStr.includes('subtitle') ||
                    classStr.includes('track') ||
                    classStr.includes('cue') ||
                    classStr.includes('playkit-text-track') ||
                    classStr.includes('playkit-subtitle') ||
                    classStr.includes('playkit-captions'))) {
                isSubtitle = true;
                text = target.textContent;
            }
        }
    }

    if (isSubtitle && text && text.trim().length > 0) {
        if (target.nodeType === Node.ELEMENT_NODE) {
            target.style.visibility = 'hidden';
        } else if (target.nodeType === Node.TEXT_NODE && target.parentElement) {
            target.parentElement.style.visibility = 'hidden';
        }

        const trimmedText = text.trim();
        if (!domSubtitleBuffer.includes(trimmedText)) {
            if (subtitleDebounceTimer) {
                clearTimeout(subtitleDebounceTimer);
            }

            if (domSubtitleBuffer && !domSubtitleBuffer.endsWith(' ')) {
                domSubtitleBuffer += ' ';
            }
            domSubtitleBuffer += trimmedText;

            subtitleDebounceTimer = setTimeout(async () => {
                if (textTrackObserverActive) {
                    domSubtitleBuffer = '';
                    return;
                }

                let combinedText = domSubtitleBuffer.trim();
                domSubtitleBuffer = '';

                if (combinedText && combinedText !== currentSubtitleText) {
                    const now = Date.now();
                    const timeSinceLastDisplay = now - lastDisplayTime;
                    const lastChar = lastDisplayedText.slice(-1);
                    const firstChar = combinedText.charAt(0);
                    const isContinuation = timeSinceLastDisplay < continuationThreshold &&
                        lastDisplayedText &&
                        (lastChar === ',' || lastChar === ' ' || !lastChar.match(/[.!?]/) && firstChar === firstChar.toLowerCase());

                    if (isContinuation) {
                        combinedText = lastDisplayedText + ' ' + combinedText;
                        console.log('Subtitle continuation detected, combined:', combinedText);
                    } else {
                        console.log('Subtitle detected:', combinedText);
                    }

                    currentSubtitleText = combinedText;
                    lastDisplayedText = combinedText;
                    lastDisplayTime = now;

                    let translatedText = null;
                    if (showTranslatedSubtitle) {
                        const result = await translateText(combinedText);
                        if (result && result.translatedText) {
                            translatedText = result.translatedText;
                        }
                    }

                    showInteractiveSubtitle(combinedText, translatedText);
                }
            }, 400);
        }
    } else if (isSubtitle) {
        // Ensure native subtitles are hidden even if text hasn't changed
        if (target.nodeType === Node.ELEMENT_NODE) {
            target.style.visibility = 'hidden';
        } else if (target.nodeType === Node.TEXT_NODE && target.parentElement) {
            target.parentElement.style.visibility = 'hidden';
        }
    }
}

function showInteractiveSubtitle(text, translatedText) {
    if (!translationEnabled || !text) return;

    const overlay = createOverlay();
    clearMultiSelection({ skipTooltip: true });
    clearSingleSelection({ skipTooltip: true });
    overlay.innerHTML = ''; // Clear previous content

    overlay.style.fontFamily = `'${fontFamily}', sans-serif`;
    overlay.style.fontSize = fontSize + 'px';

    // Create wrapper for relative positioning
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';

    // Split text into words and create interactive spans
    const words = text.split(/\s+/);
    words.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;

        // Clean word for checking unknown status (remove punctuation)
        const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();

        if (cleanWord && unknownWords.has(cleanWord)) {
            wordSpan.className = 'interactive-word unknown';
            wordSpan.onmouseenter = (e) => handleWordHover(e, word);
            wordSpan.onmouseleave = () => handleWordHoverEnd();
        } else {
            wordSpan.className = 'interactive-word';
        }

        wordSpan.onclick = (e) => handleWordClick(e, word);
        wordSpan.oncontextmenu = (e) => handleWordRightClick(e, word);
        wrapper.appendChild(wordSpan);

        // Add a space after each word (except the last one, though it doesn't hurt)
        if (index < words.length - 1) {
            wrapper.appendChild(document.createTextNode(' '));
        }
    });

    // Add translated text if available
    if (translatedText) {
        const translatedDiv = document.createElement('div');
        translatedDiv.className = 'oreilly-translated-subtitle';
        translatedDiv.textContent = translatedText;
        translatedDiv.style.fontFamily = `'${translatedFontFamily}', sans-serif`;
        translatedDiv.style.fontSize = translatedFontSize + 'px';
        wrapper.appendChild(document.createElement('br')); // Line break
        wrapper.appendChild(translatedDiv);
    }

    overlay.appendChild(wrapper);
    overlay.style.display = 'block';
}

async function handleWordClick(event, word) {
    // Remove existing tooltips
    const existingTooltip = document.querySelector('.oreilly-translation-tooltip');
    if (existingTooltip) existingTooltip.remove();

    // Clean the word (remove punctuation)
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    if (!cleanWord) return;

    const isMultiSelectMode = event.metaKey;

    clearSingleSelection({ skipTooltip: true });

    if (!isMultiSelectMode) {
        clearMultiSelection();
    }

    if (isMultiSelectMode) {
        const target = event.target;
        const existingIndex = multiSelectSelection.findIndex(item => item.element === target);
        let translationAnchor = target;

        if (existingIndex >= 0) {
            multiSelectSelection[existingIndex].element.classList.remove('multi-selected');
            multiSelectSelection.splice(existingIndex, 1);
            translationAnchor = multiSelectSelection.length > 0 ? multiSelectSelection[multiSelectSelection.length - 1].element : null;
        } else {
            multiSelectSelection.push({ word: cleanWord, element: target });
            target.classList.add('multi-selected');
        }

        if (multiSelectSelection.length === 0 || !translationAnchor) {
            hideTooltip();
            return;
        }

        translationAnchor.style.opacity = '0.7';
        const combinedText = multiSelectSelection.map(item => item.word).join(' ');
        const result = await translateText(combinedText);
        translationAnchor.style.opacity = '1';

        if (result.translatedText) {
            showTooltip(translationAnchor, result.translatedText);
        }
        return;
    }

    // Show loading state or immediate feedback if needed
    event.target.style.opacity = '0.7';

    const result = await translateText(cleanWord);

    event.target.style.opacity = '1';

    if (result.translatedText) {
        showTooltip(event.target, result.translatedText);
    }

    event.target.classList.add('single-selected');
    singleSelectedElement = event.target;
}

function handleWordRightClick(event, word) {
    event.preventDefault();

    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();
    if (!cleanWord) return;

    if (event.metaKey) {
        addToGlossary(cleanWord);
        return;
    }

    if (unknownWords.has(cleanWord)) {
        unknownWords.delete(cleanWord);
    } else {
        unknownWords.add(cleanWord);
    }

    chrome.storage.sync.set({ unknownWords: Array.from(unknownWords) });

    if (unknownWords.has(cleanWord)) {
        event.target.className = 'interactive-word unknown';
    } else {
        event.target.className = 'interactive-word';
    }

    const allWordSpans = document.querySelectorAll('.interactive-word');
    allWordSpans.forEach(span => {
        const spanCleanWord = span.textContent.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();
        if (spanCleanWord === cleanWord) {
            if (unknownWords.has(cleanWord)) {
                span.className = 'interactive-word unknown';
            } else {
                span.className = 'interactive-word';
            }
        }
    });

    console.log('Word marked as', unknownWords.has(cleanWord) ? 'unknown' : 'known', ':', cleanWord);
}

async function addToGlossary(word) {
    const glossaryArray = glossary ? glossary.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
    const isRemoving = glossaryArray.includes(word);

    if (isRemoving) {
        const index = glossaryArray.indexOf(word);
        glossaryArray.splice(index, 1);
        console.log('Word removed from glossary:', word);
    } else {
        glossaryArray.push(word);
        console.log('Word added to glossary:', word);
    }

    glossary = glossaryArray.join(', ');
    chrome.storage.sync.set({ glossary });

    if (currentSubtitleText && showTranslatedSubtitle) {
        const result = await translateText(currentSubtitleText);
        showInteractiveSubtitle(currentSubtitleText, result?.translatedText || null);
    }
}

function handleWordHover(event, word) {
    if (hoverDebounceTimer) {
        clearTimeout(hoverDebounceTimer);
    }

    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();
    if (!cleanWord) return;

    hoverDebounceTimer = setTimeout(async () => {
        if (translationCache[cleanWord]) {
            showTooltip(event.target, translationCache[cleanWord]);
            return;
        }

        event.target.style.opacity = '0.7';
        const result = await translateText(cleanWord);
        event.target.style.opacity = '1';

        if (result.translatedText) {
            translationCache[cleanWord] = result.translatedText;
            showTooltip(event.target, result.translatedText);
        }
    }, 300);
}

function handleWordHoverEnd() {
    if (hoverDebounceTimer) {
        clearTimeout(hoverDebounceTimer);
        hoverDebounceTimer = null;
    }
    hideTooltip();
}

function hideTooltip() {
    const existingTooltip = document.querySelector('.oreilly-translation-tooltip');
    if (existingTooltip) existingTooltip.remove();
}

function showTooltip(targetElement, text) {
    const tooltip = document.createElement('div');
    tooltip.className = 'oreilly-translation-tooltip';
    tooltip.textContent = text;

    const container = document.fullscreenElement || document.body;
    container.appendChild(tooltip);

    const rect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Position above the word
    let top = rect.top - tooltipRect.height - 10;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Close on click outside
    const closeHandler = (e) => {
        if (!tooltip.contains(e.target) && e.target !== targetElement) {
            tooltip.remove();
            document.removeEventListener('click', closeHandler);
        }
    };

    // Add a small delay to prevent immediate closing if the click event bubbles
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
    }, 100);
}

document.addEventListener('click', (event) => {
    const interactiveWord = typeof event.target?.closest === 'function'
        ? event.target.closest('.interactive-word')
        : null;

    if (interactiveWord) {
        return;
    }

    clearSingleSelection();
    clearMultiSelection();
});

function scanForSubtitles(node) {
    if (!node) return;

    // Check if the current node is a subtitle
    checkNode(node);

    // If this node has a shadow root, scan it too
    if (node.shadowRoot) {
        scanForSubtitles(node.shadowRoot);
        observeDOM(node.shadowRoot); // Ensure we observe it too
    }

    // Recursively scan children
    let child = node.firstChild;
    while (child) {
        scanForSubtitles(child);
        child = child.nextSibling;
    }
}

function observeWithTextTrackAPI() {
    const video = document.querySelector('video');
    if (!video || !video.textTracks || video.textTracks.length === 0) {
        return false;
    }

    let subtitleTrack = null;
    for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.kind === 'subtitles' || track.kind === 'captions') {
            subtitleTrack = track;
            break;
        }
    }

    if (!subtitleTrack) {
        return false;
    }

    subtitleTrack.mode = 'hidden';

    const processCueBuffer = async () => {
        let combinedText = cueBuffer.trim();
        cueBuffer = '';

        if (combinedText && combinedText !== currentSubtitleText) {
            const now = Date.now();
            const timeSinceLastDisplay = now - lastDisplayTime;
            const lastChar = lastDisplayedText.slice(-1);
            const firstChar = combinedText.charAt(0);
            const isContinuation = timeSinceLastDisplay < continuationThreshold &&
                lastDisplayedText &&
                (lastChar === ',' || lastChar === ' ' || !lastChar.match(/[.!?]/) && firstChar === firstChar.toLowerCase());

            if (isContinuation) {
                combinedText = lastDisplayedText + ' ' + combinedText;
                console.log('TextTrack continuation detected, combined:', combinedText);
            } else {
                console.log('TextTrack subtitle:', combinedText);
            }

            currentSubtitleText = combinedText;
            lastDisplayedText = combinedText;
            lastDisplayTime = now;

            let translatedText = null;
            if (showTranslatedSubtitle) {
                const result = await translateText(combinedText);
                if (result && result.translatedText) {
                    translatedText = result.translatedText;
                }
            }

            showInteractiveSubtitle(combinedText, translatedText);
        }
    };

    const handleCueChange = () => {
        if (!isExtensionContextValid() || !translationEnabled) return;

        if (subtitleTrack.activeCues && subtitleTrack.activeCues.length > 0) {
            const currentCue = subtitleTrack.activeCues[0];
            const text = currentCue.text;

            if (text && text.trim().length > 0) {
                if (cueBufferTimer) {
                    clearTimeout(cueBufferTimer);
                }

                if (cueBuffer && !cueBuffer.endsWith(' ')) {
                    cueBuffer += ' ';
                }
                cueBuffer += text.trim();

                cueBufferTimer = setTimeout(processCueBuffer, 400);
            }
        }
    };

    subtitleTrack.addEventListener('cuechange', handleCueChange);

    video.textTracks.addEventListener('addtrack', (e) => {
        const track = e.track;
        if (track.kind === 'subtitles' || track.kind === 'captions') {
            track.mode = 'hidden';
            track.addEventListener('cuechange', handleCueChange);
        }
    });

    console.log("O'Reilly Translator: TextTrack API observer active with", subtitleTrack.cues ? subtitleTrack.cues.length : 0, "cues");
    textTrackObserverActive = true;
    return true;
}

function observeSubtitles() {
    console.log("O'Reilly Translator: Starting observer...");

    if (observeWithTextTrackAPI()) {
        console.log("O'Reilly Translator: Using TextTrack API (no fragment issue)");
    } else {
        console.log("O'Reilly Translator: TextTrack not available, using DOM observer with debounce");
        observeDOM(document.body);
        scanForSubtitles(document.body);
    }

    console.log("O'Reilly Translator: Observer active.");
}

function startObserving() {
    console.log("O'Reilly Translator: Starting observer...");

    if (observeWithTextTrackAPI()) {
        console.log("O'Reilly Translator: Using TextTrack API (no fragment issue)");
        return;
    }

    console.log("O'Reilly Translator: TextTrack not available yet, using DOM observer with debounce");
    observeDOM(document.body);
    scanForSubtitles(document.body);

    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = setInterval(() => {
        retryCount++;
        if (textTrackObserverActive || retryCount >= maxRetries) {
            clearInterval(retryInterval);
            if (textTrackObserverActive) {
                console.log("O'Reilly Translator: Switched to TextTrack API");
            } else {
                console.log("O'Reilly Translator: TextTrack not available, continuing with DOM observer");
            }
            return;
        }

        if (observeWithTextTrackAPI()) {
            console.log("O'Reilly Translator: TextTrack API now available, switching...");
        }
    }, 2000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(startObserving, 1000);
} else {
    window.addEventListener('load', () => setTimeout(startObserving, 1000));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showInteractiveSubtitle,
        translateText,
        createOverlay,
        constrainOverlayToViewport,
        scanForSubtitles,
        checkNode,
        handleWordClick,
        handleWordRightClick,
        handleWordHover,
        handleWordHoverEnd,
        hideTooltip,
        addToGlossary,
        observeWithTextTrackAPI,
        startObserving,
        get translationCache() { return translationCache; },
        set translationCache(val) { translationCache = val; },
        get glossary() { return glossary; },
        set glossary(val) { glossary = val; },
        get textTrackObserverActive() { return textTrackObserverActive; },
        set textTrackObserverActive(val) { textTrackObserverActive = val; }
    };
}
