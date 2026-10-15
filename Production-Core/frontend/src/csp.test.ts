import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers: { source: string; headers: { key: string; value: string }[] }[] = JSON.parse(readFileSync('vercel.json', 'utf-8')).headers;
const all = headers.find((h) => h.source === '/(.*)')!.headers;
const policy = () => all.find((h) => h.key === 'Content-Security-Policy-Report-Only')?.value ?? '';
const directive = (name: string) => policy().split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy (report only)', () => {
    it('is report-only: it logs violations in the console and blocks nothing yet', () => {
        expect(policy()).not.toBe('');
        expect(all.some((h) => h.key === 'Content-Security-Policy')).toBe(false);
    });
    it('lists the origins the app really uses', () => {
        expect(directive('style-src')).toContain('https://fonts.googleapis.com');
        expect(directive('font-src')).toContain('https://fonts.gstatic.com');
        expect(directive('script-src')).toContain('https://apis.google.com');                 // Firebase's Google sign-in popup
        expect(directive('script-src')).toContain('https://cdn.jsdelivr.net');                // the Monaco code editor
        expect(directive('connect-src')).toContain('https://identitytoolkit.googleapis.com'); // Firebase sign-in
        expect(directive('connect-src')).toContain('https://securetoken.googleapis.com');
        expect(directive('connect-src')).toContain('wss://*.onrender.com');                   // the live session
        expect(directive('frame-src')).toContain('https://accounts.google.com');
    });
    it('shuts the doors nobody needs', () => {
        expect(directive('object-src')).toBe("object-src 'none'");
        expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
        expect(directive('base-uri')).toBe("base-uri 'self'");
    });
});
