import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** While the live session is not the way in, no button, link or menu may lead to it. The route itself stays, so nothing 404s. */
function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? sources(p) : /\.(tsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });
}

describe('navigation', () => {
    it('nothing in the app navigates to the live session', () => {
        const offenders = sources('src')
            .filter((f) => !/App\.tsx$|useWebSocket\.ts$/.test(f))
            .filter((f) => /(navigate\(|to=|href=)\s*[{(]?\s*[`'"]\/session/.test(readFileSync(f, 'utf-8')));
        expect(offenders).toEqual([]);
    });
});
