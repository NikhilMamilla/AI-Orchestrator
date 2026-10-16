import { describe, expect, it } from 'vitest';
import { MAX_RETRIES, shouldRetry } from './coldStart';

describe('retrying reads while the backend wakes up', () => {
    it('retries a timed-out GET', () => expect(shouldRetry({ code: 'ECONNABORTED', config: { method: 'get' } })).toBe(true));
    it('retries a GET answered with 503', () => expect(shouldRetry({ response: { status: 503 }, config: { method: 'get' } })).toBe(true));
    it('never retries a POST', () => expect(shouldRetry({ code: 'ECONNABORTED', config: { method: 'post' } })).toBe(false));
    it('does not retry a real answer such as 401 or 422', () => {
        expect(shouldRetry({ response: { status: 401 }, config: { method: 'get' } })).toBe(false);
        expect(shouldRetry({ response: { status: 422 }, config: { method: 'get' } })).toBe(false);
    });
    it('stops after the limit', () => expect(shouldRetry({ code: 'ECONNABORTED', config: { method: 'get', __retries: MAX_RETRIES } })).toBe(false));
    it('does not retry a cancelled request', () => expect(shouldRetry({ code: 'ERR_CANCELED', config: { method: 'get' } })).toBe(false));
});
