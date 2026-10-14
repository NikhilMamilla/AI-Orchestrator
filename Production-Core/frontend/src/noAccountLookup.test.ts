import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESET_LINK_MESSAGE } from './lib/resetMessage';

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });
}

describe('forgot password', () => {
    it('never asks the server whether an account exists', () => {
        const offenders = sources('src').filter((f) => /account-check|\/auth\/seen/.test(readFileSync(f, 'utf-8')));
        expect(offenders).toEqual([]);
    });
    it('always shows the same neutral message', () => {
        expect(RESET_LINK_MESSAGE).toBe("If an account exists for that email, we've sent a reset link. If you signed up with Google, use Continue with Google.");
    });
});
