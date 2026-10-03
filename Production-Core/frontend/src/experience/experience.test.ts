import { describe, expect, it } from 'vitest';
import challengesJson from '../../../data/challenges/challenges.json';
import sketchPy from '../../../backend/app/learning/sketch.py?raw';
import roadmapMd from '../../../../curriculum/dsa_roadmap.md?raw';
import assetTodo from '../../ASSET-TODO.md?raw';
import { CONCEPT_GRAPH } from '../lib/conceptGraph';
import { ALGOS } from '../lib/algoSteps';
import { CHALLENGE_CONCEPTS, CONCEPTS_BY_DOMAIN, DOMAINS, DRAW_CONCEPTS, ROADS, VISUALIZER_CONCEPTS, parseRoadmap } from './domains';
import { STAGES, edgeOf, holdVisible, lineVisibility, maxTarget, minTarget, rulerPosition, stepHold } from './flow';
import { EXPERIENCE_ASSETS } from '../lib/experienceAssets';


describe('story flow', () => {
    const believed = STAGES[0], burn = STAGES[2], tunnel = STAGES[3], city = STAGES[4];

    it('has the five beats in order and only the city is final', () => {
        expect(STAGES.map((s) => s.id)).toEqual(['believed', 'shatter', 'burn', 'tunnel', 'city']);
        expect(STAGES.filter((s) => s.final).map((s) => s.id)).toEqual(['city']);
    });

    it('stops scrolling at a hold gate until the hold is done', () => {
        expect(maxTarget(believed, false)).toBe(0.95);
        expect(maxTarget(burn, false)).toBe(0.95);
        expect(maxTarget(burn, true)).toBeGreaterThan(1);
        expect(maxTarget(city, false)).toBe(1);                         // the city's opening scrolls, then it is browsed
        expect(minTarget(0)).toBe(0);
        expect(minTarget(2)).toBeLessThan(0);
    });

    it('fills a hold in its duration and drains twice as fast', () => {
        let v = 0;
        for (let t = 0; t < 3000; t += 16) v = stepHold(v, true, 16, 3000);
        expect(v).toBeCloseTo(1, 1);
        v = 0.5;
        for (let t = 0; t < 750; t += 15) v = stepHold(v, false, 15, 3000);
        expect(v).toBeCloseTo(0, 5);
        expect(stepHold(0, false, 100, 1500)).toBe(0);
        expect(stepHold(1, true, 100, 1500)).toBe(1);
    });

    it('shows the hold ring only near the gate and only until it is done', () => {
        expect(holdVisible(believed, 0.5, false)).toBe(false);
        expect(holdVisible(believed, 0.94, false)).toBe(true);
        expect(holdVisible(believed, 0.95, true)).toBe(false);
        expect(holdVisible(tunnel, 0.99, false)).toBe(false);
    });

    it('hands over at the edges, never past an unfinished gate', () => {
        expect(edgeOf(1, STAGES[1], 1, 1.07, false)).toBe(1);
        expect(STAGES.filter((s) => s.hold?.advance).map((s) => s.id)).toEqual(['believed', 'burn']);
        expect(STAGES.find((s) => s.cut === 'snapshot')).toBeUndefined();     // stage 2 opens straight on its red curtain
        expect(edgeOf(2, burn, 1, 1.07, false)).toBe(0);
        expect(edgeOf(2, burn, 1, 1.07, true)).toBe(1);
        expect(edgeOf(2, burn, 0, -0.07, false)).toBe(-1);
        expect(edgeOf(0, believed, 0, -0.07, false)).toBe(0);
        expect(edgeOf(4, city, 0, 2, true)).toBe(0);
    });

    it('maps the whole story onto the ruler', () => {
        expect(rulerPosition(0, 0)).toBe(0);
        expect(rulerPosition(4, 0)).toBe(1);
        expect(rulerPosition(1, 0.5)).toBeCloseTo(0.375);
    });

    it('fades statement lines in and out', () => {
        expect(lineVisibility(0.0, 0.1, 0.5).v).toBe(0);
        expect(lineVisibility(0.3, 0.1, 0.5).v).toBe(1);
        expect(lineVisibility(0.6, 0.1, 0.5).v).toBe(0);
    });
});

describe('DSA city data', () => {
    const roadmap = roadmapMd;

    it('has exactly the 22 roadmap domains, in roadmap order', () => {
        const parsed = parseRoadmap(roadmap);
        expect(parsed).toHaveLength(22);
        expect(DOMAINS.map((d) => d.n)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
        expect(DOMAINS[1].name).toBe('Arrays');
        expect(DOMAINS[1].tagline).toBe('Building Blocks');
        expect(DOMAINS[1].bullets[0]).toEqual({ label: 'Basics', text: 'Traversal, Insertion/Deletion, Search (Linear/Binary).' });
        DOMAINS.forEach((d) => expect(d.bullets.length).toBeGreaterThan(0));
    });

    it('places every concept document in exactly one domain', () => {
        const all = Object.values(CONCEPTS_BY_DOMAIN).flat();
        expect(new Set(all).size).toBe(all.length);
        expect([...all].sort()).toEqual(CONCEPT_GRAPH.map((c) => c.id).sort());
    });

    it('derives levels from the concept documents and says when nothing is written yet', () => {
        expect(DOMAINS[0].level).toBe('Foundations');                  // big-o-complexity is beginner
        expect(DOMAINS[1].level).toBe('Foundations → Intermediate');    // arrays + prefix sum + two pointers
        expect(DOMAINS[4].concepts).toHaveLength(0);                    // Mathematics: no document yet
        expect(DOMAINS[4].level).toBeNull();
        expect(DOMAINS[4].tools).toEqual([]);
    });

    it('only offers a tool chip where the tool really exists', () => {
        const challenges = challengesJson as { concept: string }[];
        expect([...new Set(challenges.map((c) => c.concept))].sort()).toEqual([...CHALLENGE_CONCEPTS].sort());
        expect(ALGOS.map((a) => a.id).sort()).toEqual(['binary', 'bubble', 'insertion', 'linear', 'merge', 'quick', 'selection']);
        expect(sketchPy).toMatch(/KINDS = \{"bst".*"min-heap".*"max-heap"/);
        expect(DRAW_CONCEPTS).toEqual(['binary-search-tree', 'heap-priority-queue']);
        expect(VISUALIZER_CONCEPTS).toEqual(['arrays', 'binary-search', 'sorting-algorithms']);
        const tools = (n: number) => DOMAINS[n - 1].tools;
        expect(tools(11)).toContain('Visualizer');
        expect(tools(14)).toContain('Draw it');
        expect(tools(14)).not.toContain('Judge0 challenges');
        expect(tools(17)).toContain('Judge0 challenges');                // breadth-first-search
        expect(tools(19)).not.toContain('Visualizer');
    });

    it('draws roads only along real prerequisite links between different domains', () => {
        const idx = (id: string) => DOMAINS.findIndex((d) => d.concepts.some((c) => c.id === id));
        expect(ROADS.length).toBeGreaterThan(10);
        for (const [a, b] of ROADS) {
            expect(a).not.toBe(b);
            const linked = DOMAINS[b].concepts.some((c) => CONCEPT_GRAPH.find((g) => g.id === c.id)!.prereqs.some((p) => idx(p) === a));
            expect(linked).toBe(true);
        }
        expect(ROADS).toContainEqual([idx('arrays'), idx('graph-basics')]);           // graph-basics needs arrays
        expect(ROADS).not.toContainEqual([idx('graph-basics'), idx('dijkstra')]);     // same district: no road
    });

    it('lays the city out without two districts on the same plot', () => {
        const keys = DOMAINS.map((d) => `${d.x.toFixed(2)},${d.z.toFixed(2)}`);
        expect(new Set(keys).size).toBe(22);
        expect(DOMAINS[0].z).toBe(-0);                                   // the foundations are the front row
    });
});

describe('asset manifest', () => {
    const entries = Object.entries(EXPERIENCE_ASSETS);
    const todo = assetTodo;

    it('never references brand files, company videos, logos, paid fonts, the world map or the texts atlas', () => {
        for (const [, a] of entries) expect(a.path).not.toMatch(/^(fonts|logos|brand)\/|Card\.mp4$|PPSupply|STKBureau|Bethany|world\.ktx2|texts\.ktx2/);
    });

    it('lists every placeholder in ASSET-TODO.md with a replacement', () => {
        for (const [key, a] of entries.filter(([, x]) => x.placeholder)) {
            expect(todo, key).toContain(a.path);
            expect(a.replaceWith.length, key).toBeGreaterThan(0);
        }
    });
});
