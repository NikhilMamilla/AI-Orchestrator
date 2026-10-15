import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('bundle', () => {
    it('keeps Firebase in its own file so app updates do not re-download it', () => {
        const config = readFileSync('vite.config.ts', 'utf-8');
        expect(config).toContain('manualChunks');
        expect(config).toMatch(/firebase:\s*\[[^\]]*'firebase\/auth'/);
    });
});
