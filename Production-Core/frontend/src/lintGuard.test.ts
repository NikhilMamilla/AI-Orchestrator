import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('lint guard', () => {
    it('npm run lint fails on any warning, so the hook warnings that were fixed cannot come back', () => {
        const scripts = JSON.parse(readFileSync('package.json', 'utf-8')).scripts;
        expect(scripts.lint).toContain('--max-warnings 0');
    });
});
