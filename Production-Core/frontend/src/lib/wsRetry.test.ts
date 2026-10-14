import { describe, expect, it } from 'vitest';
import { shouldReconnect } from './wsRetry';

describe('live session reconnect rule', () => {
    it('retries a dropped connection a limited number of times', () => {
        expect(shouldReconnect(1006, 0, 5)).toBe(true);
        expect(shouldReconnect(1006, 4, 5)).toBe(true);
        expect(shouldReconnect(1006, 5, 5)).toBe(false);
    });
    it('never retries after the server refused the login (4401): it would only be refused again', () => {
        expect(shouldReconnect(4401, 0, 5)).toBe(false);
    });
});
