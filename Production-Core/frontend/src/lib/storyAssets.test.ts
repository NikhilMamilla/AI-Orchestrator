import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPERIENCE_ASSETS, STAGE_ASSETS } from './experienceAssets';

/** The story only loads files it draws. Stage 1 is words over the sky (only its camera path is used); stage 2 uses the camera path
 *  and the glass shards. The hand models and the glass pane were never visible, so they are not in the registry or any preload list. */
describe('story assets', () => {
    it('lists only what the stages use', () => {
        expect(STAGE_ASSETS.believed).toEqual(['camera1']);
        expect(STAGE_ASSETS.shatter).toEqual(['glassShards', 'camera2', 'stage2Bg']);
    });
    it('no longer registers the hands, the pane or the files only they used', () => {
        for (const key of ['handEth', 'handHuman', 'handHuman2', 'handMatcap', 'humanHandsAtlas', 'glassShatter', 'frostNormal']) {
            expect(Object.keys(EXPERIENCE_ASSETS)).not.toContain(key);
        }
    });
    it('every preloaded key exists in the registry', () => {
        for (const keys of Object.values(STAGE_ASSETS)) for (const k of keys) expect(Object.keys(EXPERIENCE_ASSETS)).toContain(k);
    });
    it('the two asset-based stages do not ask for the removed files', () => {
        for (const f of ['src/experience/stages/assets/believed.ts', 'src/experience/stages/assets/shatter.ts']) {
            const src = readFileSync(f, 'utf-8');
            for (const k of ["'handEth'", "'handHuman'", "'handHuman2'", "'glassShatter'", "'humanHandsAtlas'"]) expect(src).not.toContain(k);
        }
    });
});
