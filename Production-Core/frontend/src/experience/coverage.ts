import type { Domain } from './domains';

/** How much of the 22-domain roadmap has course notes, so no page claims more than Kiddoo can teach. */
export function coverage(domains: Domain[]) {
    const covered = domains.filter((d) => d.concepts.length > 0);
    const concepts = covered.reduce((n, d) => n + d.concepts.length, 0);
    return {
        total: domains.length,
        covered: covered.length,
        concepts,
        missing: domains.filter((d) => d.concepts.length === 0).map((d) => d.name),
        sentence: `The roadmap has ${domains.length} domains; Kiddoo's notes cover ${covered.length} of them so far (${concepts} concepts).`,
    };
}
