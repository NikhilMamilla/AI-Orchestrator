import { CONCEPT_GRAPH } from '../lib/conceptGraph';
import roadmapMd from '../../../../curriculum/dsa_roadmap.md?raw';

/**
 * The DSA city's data. Every district is a domain of curriculum/dsa_roadmap.md, parsed at build time so the two can never
 * drift. Which Kiddoo concept documents belong to a domain is the one hand-made table here (CONCEPTS_BY_DOMAIN); levels,
 * roads, layout and tool chips are all derived from real data, and a test checks each derivation against its source file.
 */

export interface RoadmapDomain { n: number; name: string; tagline: string | null; bullets: { label: string; text: string }[] }

/** "## 🟢 2. Arrays (Building Blocks)" followed by "- **Basics**: Traversal, ..." lines. */
export function parseRoadmap(md: string): RoadmapDomain[] {
    const out: RoadmapDomain[] = [];
    for (const line of md.split(/\r?\n/)) {
        const h = line.match(/^##\s+\S*\s*(\d+)\.\s+(.+?)\s*$/u);
        if (h) {
            const m = h[2].match(/^(.*?)\s*\(([^)]*)\)\s*$/);
            out.push({ n: Number(h[1]), name: (m ? m[1] : h[2]).trim(), tagline: m ? m[2].trim() : null, bullets: [] });
            continue;
        }
        const b = line.match(/^\s*-\s+\*\*(.+?)\*\*:\s*(.+)$/);
        if (b && out.length) out[out.length - 1].bullets.push({ label: b[1].trim(), text: b[2].trim() });
    }
    return out;
}

/** Kiddoo's concept documents (data/knowledge/*.md) grouped under the roadmap domain they teach. */
export const CONCEPTS_BY_DOMAIN: Record<number, string[]> = {
    1: ['big-o-complexity'],
    2: ['arrays', 'prefix-sum', 'two-pointers-sliding-window'],
    3: ['string-matching-kmp'],
    4: ['bit-manipulation'],
    6: ['recursion', 'backtracking'],
    7: ['linked-list'],
    8: ['stack'],
    9: ['queue'],
    10: ['hash-table'],
    11: ['sorting-algorithms'],
    12: ['binary-search'],
    13: ['binary-tree'],
    14: ['binary-search-tree'],
    15: ['heap-priority-queue'],
    16: ['greedy-algorithms'],
    17: ['graph-basics', 'breadth-first-search', 'depth-first-search', 'dijkstra', 'topological-sort', 'union-find'],
    18: ['dynamic-programming'],
    19: ['trie'],
};

// Where each tool really exists. Tests compare these lists with their sources.
/** data/challenges/challenges.json: concepts with sandbox-graded challenges. */
export const CHALLENGE_CONCEPTS = ['arrays', 'binary-search', 'breadth-first-search', 'dynamic-programming', 'hash-table', 'linked-list', 'prefix-sum', 'recursion', 'sorting-algorithms', 'stack', 'two-pointers-sliding-window'];
/** lib/algoSteps.ts: binary and linear search (on arrays) and five sorts. */
export const VISUALIZER_CONCEPTS = ['arrays', 'binary-search', 'sorting-algorithms'];
/** backend learning/sketch.py KINDS: a BST or a heap can be drawn and checked. */
export const DRAW_CONCEPTS = ['binary-search-tree', 'heap-priority-queue'];

export type Tool = 'Ask with citations' | 'Teach it back' | 'Spaced review' | 'Visualizer' | 'Draw it' | 'Judge0 challenges';
const LEVEL_NAME: Record<string, string> = { beginner: 'Foundations', intermediate: 'Intermediate', advanced: 'Advanced' };
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];

export interface Domain extends RoadmapDomain {
    concepts: { id: string; title: string; level: string }[];
    level: string | null;               // "Foundations", "Intermediate → Advanced", or null when no concept is written yet
    tools: Tool[];
    depth: number;                      // prerequisite depth of its earliest concept (rows of the city); planned domains last
    x: number; z: number;               // city layout, world units
}

const byId = new Map(CONCEPT_GRAPH.map((c) => [c.id, c]));

/** Longest prerequisite chain under each concept: 0 for a concept with no prerequisites. */
function conceptDepths() {
    const memo = new Map<string, number>();
    const depth = (id: string): number => {
        if (memo.has(id)) return memo.get(id)!;
        memo.set(id, 0);                                                     // guards a cycle, should one ever appear
        const pre = byId.get(id)?.prereqs ?? [];
        const d = pre.length ? 1 + Math.max(...pre.map(depth)) : 0;
        memo.set(id, d);
        return d;
    };
    CONCEPT_GRAPH.forEach((c) => depth(c.id));
    return memo;
}

export function buildDomains(md: string = roadmapMd): Domain[] {
    const depths = conceptDepths();
    const raw = parseRoadmap(md);
    const domains: Domain[] = raw.map((d) => {
        const ids = CONCEPTS_BY_DOMAIN[d.n] ?? [];
        const concepts = ids.map((id) => {
            const c = byId.get(id);
            if (!c) throw new Error(`unknown concept ${id}`);
            return { id, title: c.title, level: c.level };
        });
        const lv = concepts.map((c) => LEVEL_ORDER.indexOf(c.level)).filter((i) => i >= 0);
        const lo = LEVEL_ORDER[Math.min(...lv)], hi = LEVEL_ORDER[Math.max(...lv)];
        const level = lv.length ? (lo === hi ? LEVEL_NAME[lo] : `${LEVEL_NAME[lo]} → ${LEVEL_NAME[hi]}`) : null;
        const tools: Tool[] = [];
        if (ids.length) tools.push('Ask with citations', 'Teach it back', 'Spaced review');
        if (ids.some((i) => VISUALIZER_CONCEPTS.includes(i))) tools.push('Visualizer');
        if (ids.some((i) => DRAW_CONCEPTS.includes(i))) tools.push('Draw it');
        if (ids.some((i) => CHALLENGE_CONCEPTS.includes(i))) tools.push('Judge0 challenges');
        const depth = ids.length ? Math.min(...ids.map((i) => depths.get(i) ?? 0)) : Infinity;
        return { ...d, concepts, level, tools, depth, x: 0, z: 0 };
    });

    // layout: one row per prerequisite depth, the foundations at the front; domains without content form the last row
    const SP = 7.2;
    const rows = new Map<number, Domain[]>();
    domains.forEach((d) => {
        const r = Number.isFinite(d.depth) ? d.depth : 99;
        rows.set(r, [...(rows.get(r) ?? []), d]);
    });
    [...rows.keys()].sort((a, b) => a - b).forEach((r, ri) => {
        const row = rows.get(r)!;
        row.forEach((d, i) => {
            d.x = (i - (row.length - 1) / 2) * SP + (ri % 2 ? SP * 0.35 : 0);  // stagger rows a little, like city blocks
            d.z = -ri * SP * 0.92;
        });
    });
    return domains;
}

/** Roads: domain A → domain B when a concept of B lists a concept of A as a prerequisite. Nothing else is drawn. */
export function domainRoads(domains: Domain[]): [number, number][] {
    const domainOf = new Map<string, number>();
    domains.forEach((d, i) => d.concepts.forEach((c) => domainOf.set(c.id, i)));
    const seen = new Set<string>(), roads: [number, number][] = [];
    for (const c of CONCEPT_GRAPH) {
        const to = domainOf.get(c.id);
        if (to === undefined) continue;
        for (const p of c.prereqs) {
            const from = domainOf.get(p);
            if (from === undefined || from === to) continue;
            const key = `${from}-${to}`;
            if (!seen.has(key)) { seen.add(key); roads.push([from, to]); }
        }
    }
    return roads;
}

export const DOMAINS = buildDomains();
export const ROADS = domainRoads(DOMAINS);
