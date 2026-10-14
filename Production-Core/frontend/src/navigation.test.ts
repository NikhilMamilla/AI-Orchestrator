import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The live session answers from the notes (cited or refused), so one button opens it: the dashboard's "Start a session".
 *  Nothing else links to it, and the route itself stays so nothing 404s. */
function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? sources(p) : /\.(tsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });
}

const links = (f: string) => /(navigate\(|to=|href=)\s*[{(]?\s*[`'"]\/session/.test(readFileSync(f, 'utf-8'));

describe('navigation', () => {
    it('only the dashboard start button leads to the live session', () => {
        const offenders = sources('src').filter((f) => !/App\.tsx$|useWebSocket\.ts$/.test(f)).filter(links);
        expect(offenders.map((f) => f.replace(/\/g, '/'))).toEqual(['src/pages/DashboardPage.tsx']);
        expect(readFileSync('src/pages/DashboardPage.tsx', 'utf-8')).toContain("navigate('/session/active')");
    });
});
