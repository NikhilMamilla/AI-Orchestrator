// Fails the build if a third-party placeholder asset (or a paid font name) made it into dist/.
// Placeholders live in placeholder-assets/ (gitignored, served by the dev server only); see ASSET-TODO.md.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(here, '../dist');
const placeholders = resolve(here, '../placeholder-assets');

const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
});
// compared by content, not by name: our own decoders (three.js's copies) share file names with the placeholder copies
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

let known = [];
try { known = walk(placeholders).map(hash); } catch { /* no placeholder folder on this machine: only the text checks run */ }
// files that are byte-identical to three.js's own open-source decoders (three bundles them itself) are not placeholders
let openSource = [];
try { openSource = walk(resolve(here, '../node_modules/three/examples/jsm/libs')).map(hash); } catch { /* three not installed */ }
const forbidden = new Set(known.filter((h) => !openSource.includes(h)));
const fontNames = /PPSupply|PP Supply|STKBureau|STK Bureau|Bethany Elingston/;

const files = walk(dist);
const problems = [];
for (const file of files) {
    const rel = relative(dist, file);
    if (forbidden.has(hash(file))) problems.push(`${rel}: a placeholder file was copied into the build`);
    if (/\.(js|css|html)$/.test(file)) {
        const text = readFileSync(file, 'utf-8');
        if (fontNames.test(text)) problems.push(`${rel}: references a paid placeholder font`);
        // production code folds PLACEHOLDERS_ENABLED to false, so the URL prefix must not survive minification at all
        if (text.includes('/placeholder-assets/')) problems.push(`${rel}: can request a placeholder URL`);
    }
}

if (problems.length) {
    console.error('check-dist: placeholder content found in dist/\n  ' + problems.join('\n  '));
    process.exit(1);
}
console.log(`check-dist: ok (${files.length} files, none of ${forbidden.size} placeholder files, no paid font names, no placeholder URLs)`);
