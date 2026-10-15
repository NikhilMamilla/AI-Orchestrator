import { DOMAINS } from '../../experience/domains';
import { coverage } from '../../experience/coverage';

const COVER = coverage(DOMAINS);

/** The whole roadmap, with the domains Kiddoo has course notes for marked, so the page never promises more than it can teach. */
export default function RoadmapCoverage() {
    return (
        <div className="mx-auto mt-10 max-w-4xl text-center" data-testid="roadmap-coverage">
            <p className="text-sm text-campus-warm-500">{COVER.sentence} The others are marked <em>notes coming</em>; Kiddoo will say so rather than guess.</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
                {DOMAINS.map((d) => {
                    const written = d.concepts.length > 0;
                    return (
                        <li key={d.n} title={written ? `${d.concepts.length} concept${d.concepts.length > 1 ? 's' : ''} written` : 'On the roadmap; notes coming'}
                            className={written
                                ? 'glass-chip px-2.5 py-1 text-[10px] font-accent font-semibold text-campus-navy'
                                : 'rounded-full border border-dashed border-campus-warm-300 px-2.5 py-1 text-[10px] font-accent text-campus-warm-400'}>
                            {written ? '✓ ' : ''}{d.name}{written ? '' : ' · notes coming'}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
