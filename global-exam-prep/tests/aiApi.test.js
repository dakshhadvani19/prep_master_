import { describe, it, expect } from 'vitest';
import { categoriseGroqError } from '../api/ai';

describe('Groq API error categorisation', () => {
    it('recognises Groq json_validate_failed as a recoverable generation-format error', () => {
        expect(categoriseGroqError(
            400,
            "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
            'json_validate_failed',
        )).toBe('generation_format');
    });

    it('classifies the same error correctly when provider code is absent', () => {
        expect(categoriseGroqError(
            400,
            'Failed to validate JSON. Please adjust your prompt.',
        )).toBe('generation_format');
    });

    it('preserves rate-limit classification', () => {
        expect(categoriseGroqError(429, 'Rate limit reached: try again in 3s')).toBe('rate_limit');
    });

    it('distinguishes unsupported response schemas from generation-format failures', () => {
        expect(categoriseGroqError(400, 'json_schema response format is not supported')).toBe('schema_config');
    });
});
