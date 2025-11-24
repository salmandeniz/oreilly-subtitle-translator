const background = require('../background.js');

describe('Background Script', () => {
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
        beforeEach(() => {
            global.fetch = jest.fn();
        });

        afterEach(() => {
            jest.resetAllMocks();
        });

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
});
