// Content script for O'Reilly Subtitle Translator

console.log("O'Reilly Subtitle Translator: Content script loaded in " + window.location.href);

let targetLang = 'tr';
let translationEnabled = true;
let currentSubtitleText = '';

// Load settings
chrome.storage.sync.get(['targetLang', 'enabled'], (result) => {
    if (result.targetLang) targetLang = result.targetLang;
    if (result.enabled !== undefined) translationEnabled = result.enabled;
});

// Listen for settings updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
        targetLang = request.settings.targetLang;
        translationEnabled = request.settings.enabled;
        console.log('Settings updated:', request.settings);
        // Clear current overlay if disabled
        if (!translationEnabled) {
            removeOverlay();
        }
    }
});

// Create overlay element
function createOverlay() {
    let overlay = document.getElementById('oreilly-subtitle-overlay');

    // Find the best container for the overlay
    // 1. Try the current fullscreen element
    // 2. Try known player containers
    // 3. Fallback to body
    let container = document.fullscreenElement ||
        document.querySelector('.kaltura-player-container') ||
        document.querySelector('.video-js') ||
        document.querySelector('#orm-kaltura-player') ||
        document.body;

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
    return overlay;
}

// Listen for fullscreen changes to ensure overlay is in the right place
document.addEventListener('fullscreenchange', () => {
    const overlay = document.getElementById('oreilly-subtitle-overlay');
    if (overlay && currentSubtitleText) {
        // Re-append to correct container
        createOverlay();
    }
});

function removeOverlay() {
    const overlay = document.getElementById('oreilly-subtitle-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showTranslation(text) {
    if (!translationEnabled || !text) return;

    const overlay = createOverlay();
    overlay.textContent = text;
    overlay.style.display = 'block';
}

// Translation function using background script
async function translateText(text) {
    if (!text) return '';

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'translate', text, targetLang }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                resolve(text);
            } else if (response && response.translatedText) {
                resolve(response.translatedText);
            } else {
                resolve(text);
            }
        });
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

    if (isSubtitle && text && text.trim().length > 0 && text !== currentSubtitleText) {
        currentSubtitleText = text;
        const translated = await translateText(text);
        // Only show translation if the subtitle hasn't changed in the meantime
        if (currentSubtitleText === text) {
            showTranslation(translated);
        }
    }
}

function observeSubtitles() {
    // Start observing the main document
    observeDOM(document.body);

    // Scan for existing shadow roots
    observeShadowRoot(document.body);

    console.log("O'Reilly Translator: Observer active.");
}

// Start observing
// Wait a bit for the page to load
setTimeout(observeSubtitles, 3000);
