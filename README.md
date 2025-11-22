# O'Reilly Subtitle Translator

A Chrome extension that translates O'Reilly video subtitles in real-time using AI-powered translation.

## Features

- 🤖 **AI-Powered Translation**: Uses Google's Gemini AI for high-quality translations
- 🔄 **Automatic Fallback**: Falls back to Google Translate if no API key is configured
- 🌍 **Multiple Languages**: Supports Turkish, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, and Chinese
- ⚡ **Real-time**: Translates subtitles as they appear on screen
- 🎯 **O'Reilly Optimized**: Specifically designed for O'Reilly Learning Platform

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/salmandeniz/oreilly-subtitle-translator.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the extension directory

5. The extension icon should appear in your Chrome toolbar

## Configuration

### Getting a Gemini API Key (Optional but Recommended)

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

### Setting Up the Extension

1. Click the extension icon in your Chrome toolbar
2. (Optional) Paste your Gemini API key in the "Gemini API Key" field
3. Select your target language from the dropdown
4. Ensure "Enable Translation" is toggled on
5. Click "Save Settings"

**Note**: If you don't provide an API key, the extension will use Google Translate (free, but lower quality).

## Usage

1. Navigate to any video on [O'Reilly Learning Platform](https://learning.oreilly.com/)
2. Enable subtitles on the video player
3. Translated subtitles will automatically appear below the original subtitles
4. The translation provider (Gemini AI or Google Translate) is shown in the extension popup

## Translation Providers

### Gemini AI (Recommended)
- **Quality**: High-quality, context-aware translations
- **Cost**: Free tier includes 15 requests/minute, 1500 requests/day
- **Setup**: Requires API key from Google AI Studio

### Google Translate (Fallback)
- **Quality**: Basic translation quality
- **Cost**: Completely free
- **Setup**: No configuration needed

## Privacy

- API keys are stored locally in Chrome's sync storage
- No data is sent to third parties except translation services
- Subtitle text is only sent to the selected translation provider

## Development

### Project Structure

```
oreilly-subtitle-translator/
├── manifest.json       # Extension configuration
├── background.js       # Translation logic
├── content.js          # Subtitle detection and overlay
├── popup.html          # Settings UI
├── popup.js            # Settings logic
├── styles.css          # Overlay styles
└── icons/              # Extension icons
```

### Building

No build process required. The extension runs directly from source files.

## Troubleshooting

**Subtitles not translating?**
- Ensure subtitles are enabled in the O'Reilly video player
- Check that "Enable Translation" is toggled on in the extension popup
- Verify your API key is correct (if using Gemini AI)

**Translation quality is poor?**
- Consider using Gemini AI instead of Google Translate
- Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey)

**Extension not working after update?**
- Reload the extension in `chrome://extensions/`
- Clear browser cache and restart Chrome

## License

MIT License - feel free to use and modify as needed.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Created by [salmandeniz](https://github.com/salmandeniz)
