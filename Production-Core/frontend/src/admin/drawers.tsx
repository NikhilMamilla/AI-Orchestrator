import { useEffect, useState } from 'react';
import { RagError } from '../lib/rag';
import { adminConcept, adminDocument, type ConceptDetail, type DocumentDetail } from './api';
import { gated, pct } from './format';
import { Drawer, Empty, ErrorLine, Loading, Status } from './ui';

const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced'];

function useFetch<T>(id: string | null, load: (id: string) => Promise<T>) {
    const [state, setState] = useState<{ id: string; data?: T; error?: string } | null>(null);
    useEffect(() => {
        if (!id) return;
        let live = true;
        load(id).then((data) => live && setState({ id, data }))
            .catch((e) => live && setState({ id, error: e instanceof RagError ? e.message : 'Could not load this.' }));
        return () => { live = false; };
    }, [id, load]);
    return state?.id === id ? state : null;
}

/** One concept across the whole cohort: bands, weekly accuracy, mix-ups, missed questions and challenges. */
export function ConceptDrawer({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
    const s = useFetch<ConceptDetail>(id, adminConcept);
    const d = s?.data;
    const k = d?.min_group ?? 1;
    const maxW = Math.max(1, ...(d?.weekly ?? []).map((w) => w.answers ?? 0));
    return (
        <Drawer open={!!id} title={d?.title ?? 'Concept'} sub={d ? `${LEVELS[d.document.level]} · ${d.document.domain} · v${d.document.version} · ${d.document.passages} passages` : undefined} onClose={onClose}>
            {!s ? <Loading /> : s.error ? <ErrorLine text={s.error} /> : d && (
                <div className="space-y-4 text-[11px]">
                    <div className="grid grid-cols-4 gap-2">
                        {[['Learners', gated(d.learners, k)], ['Accuracy', pct(d.accuracy)], ['Overdue', gated(d.overdue, k)], ['Struggling', gated(d.struggling, k)]].map(([l, v]) => (
                            <div key={l} className="a-row text-center"><p className="a-cap !text-[9px]">{l}</p><p className="font-heading a-ink text-lg font-extrabold">{v}</p></div>
                        ))}
                    </div>

                    <section>
                        <p className="a-cap mb-1.5">Mastery bands</p>
                        <div className="flex gap-2">
                            {(['learning', 'ready', 'mastered'] as const).map((b) => (
                                <span key={b} className="a-row flex-1 text-center"><span className="a-ink-2 capitalize">{b}</span> <b className="a-num a-ink">{gated(d.bands[b], k)}</b></span>
                            ))}
                        </div>
                    </section>

                    <section>
                        <p className="a-cap mb-1.5">Accuracy by week (oldest → this week)</p>
                        {d.answers == null ? <Empty>Hidden until {k}+ learners have answered on this concept.</Empty> : (
                            <div className="flex h-24 items-end gap-1.5" role="img" aria-label={d.weekly.map((w) => `${w.weeks_ago} weeks ago: ${w.accuracy == null ? 'no answers' : pct(w.accuracy)}`).join('; ')}>
                                {d.weekly.map((w) => (
                                    <div key={w.weeks_ago} className="flex flex-1 flex-col items-center gap-1" title={`${w.weeks_ago === 0 ? 'This week' : `${w.weeks_ago} week(s) ago`}: ${w.answers ?? 0} answers, ${pct(w.accuracy)} right`}>
                                        <span className="a-num a-ink text-[9px]">{w.accuracy == null ? '' : pct(w.accuracy)}</span>
                                        <span className="w-full rounded-t-[4px] border-2 border-b-0 border-[var(--max-line)]"
                                            style={{ height: `${Math.max(4, ((w.answers ?? 0) / maxW) * 56)}px`, background: w.accuracy == null ? 'var(--a-line)' : `color-mix(in srgb, var(--s-1) ${Math.round(30 + w.accuracy * 70)}%, transparent)` }} />
                                        <span className="a-muted text-[9px]">{w.weeks_ago === 0 ? 'now' : `-${w.weeks_ago}w`}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="a-muted mt-1">Bar height = answers that week; shade = share answered right.</p>
                    </section>

                    <section className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="a-cap mb-1.5">Learners pick options from</p>
                            {d.confused_with.length === 0 ? <p className="a-muted">No repeated mix-ups.</p> : d.confused_with.map((m) => <p key={m.title} className="flex justify-between"><span className="a-ink">{m.title}</span><b className="a-num">×{m.times}</b></p>)}
                        </div>
                        <div>
                            <p className="a-cap mb-1.5">Its options fool learners on</p>
                            {d.mistaken_for.length === 0 ? <p className="a-muted">None.</p> : d.mistaken_for.map((m) => <p key={m.title} className="flex justify-between"><span className="a-ink">{m.title}</span><b className="a-num">×{m.times}</b></p>)}
                        </div>
                    </section>

                    <section>
                        <p className="a-cap mb-1.5">Most-missed questions</p>
                        {d.missed_questions.length === 0 ? <p className="a-muted">None missed by {k}+ learners yet.</p> : (
                            <ul className="space-y-1.5">{d.missed_questions.map((q) => (
                                <li key={q.question} className="a-row"><p className="a-ink">{q.question}</p><p className="a-muted mt-0.5">Missed {pct(q.miss_rate)} of {q.answers} · most picked: <span style={{ color: 'var(--critical)' }}>{q.common_wrong}</span></p></li>
                            ))}</ul>
                        )}
                    </section>

                    {d.challenges.length > 0 && (
                        <section>
                            <p className="a-cap mb-1.5">Challenges</p>
                            <ul className="space-y-1">{d.challenges.map((c) => (
                                <li key={c.id} className="a-row flex justify-between gap-2"><span className="a-ink truncate">{c.title}</span><span className="a-num a-ink-2">{gated(c.tried, k)} tried · {c.pass_rate == null ? '–' : `${pct(c.pass_rate)} pass`}</span></li>
                            ))}</ul>
                        </section>
                    )}

                    <section className="grid grid-cols-2 gap-3">
                        {[{ t: 'Builds on', rows: d.prerequisites }, { t: 'Unlocks', rows: d.dependents }].map((g) => (
                            <div key={g.t}>
                                <p className="a-cap mb-1.5">{g.t}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {g.rows.length === 0 ? <span className="a-muted">Nothing</span> : g.rows.map((r) => (
                                        <button key={r.id} type="button" className="a-btn !h-7 !px-2.5 !text-[11px]" onClick={() => onOpen(r.id)}>{r.title}</button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>
                </div>
            )}
        </Drawer>
    );
}

/** A source as the retriever sees it: every citable passage. */
export function DocumentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
    const s = useFetch<DocumentDetail>(id, adminDocument);
    const d = s?.data;
    return (
        <Drawer open={!!id} title={d?.title ?? 'Document'} sub={d ? `${LEVELS[d.level]} · ${d.domain} · v${d.version} · ${d.passages.length} passages · ${d.source}` : undefined} onClose={onClose}>
            {!s ? <Loading /> : s.error ? <ErrorLine text={s.error} /> : d && (
                <div className="space-y-3 text-[11px]">
                    <div className="flex flex-wrap gap-1.5">
                        <Status level={d.passages.length ? 'good' : 'serious'} label={d.passages.length ? 'Citable' : 'No passages'} />
                        {d.tags.map((t) => <span key={t} className="max-sticker !px-2 !py-0 !text-[9px]" style={{ background: '#ddd6ff' }}>{t}</span>)}
                    </div>
                    {d.prerequisites.length > 0 && <p className="a-ink-2">Needs: <b className="a-ink">{d.prerequisites.join(', ')}</b></p>}
                    {d.passages.length === 0 ? <Empty>This document has no passages, so it can never be cited. Re-upload it.</Empty> : (
                        <ol className="space-y-2">
                            {d.passages.map((p, i) => (
                                <li key={p.id} className="a-row">
                                    <p className="a-cap mb-1 !text-[9px]">Passage {i + 1} · {p.id}</p>
                                    <p className="a-ink whitespace-pre-wrap leading-relaxed">{p.text}</p>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </Drawer>
    );
}
