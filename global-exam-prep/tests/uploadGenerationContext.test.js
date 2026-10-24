import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateQuestionsFromText } from '../src/utils/geminiQuestions';

function responseWithOneMcq() {
    return new Response(JSON.stringify({
        choices: [{
            message: {
                content: JSON.stringify({
                    questions: [{
                        text: 'Which statement matches the supplied material?',
                        options: ['Option A', 'Option B', 'Option C', 'Option D'],
                        answer: 0,
                    }],
                }),
            },
        }],
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('upload-specific generation source budget', () => {
    it('keeps the default 6,000-character cap for callers that do not pass an override', async () => {
        const fetchMock = vi.fn(() => Promise.resolve(responseWithOneMcq()));
        vi.stubGlobal('fetch', fetchMock);
        const text = `${'Source body '.repeat(900)} TAIL_SENTINEL`;

        await generateQuestionsFromText({
            text,
            count: 1,
            isObjective: true,
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const prompt = body.messages.find(message => message.role === 'user').content;
        expect(prompt).not.toContain('TAIL_SENTINEL');
        expect(prompt).toContain('SOURCE EXCERPT TRUNCATED');
    });

    it('allows upload callers to set a larger source budget without truncating the tail', async () => {
        const fetchMock = vi.fn(() => Promise.resolve(responseWithOneMcq()));
        vi.stubGlobal('fetch', fetchMock);
        const text = `${'Source body '.repeat(900)} TAIL_SENTINEL`;

        await generateQuestionsFromText({
            text,
            count: 1,
            isObjective: true,
            maxSourceChars: 12000,
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const prompt = body.messages.find(message => message.role === 'user').content;
        expect(prompt).toContain('TAIL_SENTINEL');
        expect(prompt).not.toContain('SOURCE EXCERPT TRUNCATED');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
