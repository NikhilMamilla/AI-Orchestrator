import { useRef, useState } from 'react';
import { DocumentDrawer } from '../drawers';
import { FileUp, Loader2, Search } from 'lucide-react';
import { fetchKnowledgeBase, RagError, uploadDocument } from '../../lib/rag';
import { DOMAINS } from '../../experience/domains';
import { adminChallenges, adminGaps } from '../api';
import { gated, num, pct } from '../format';
import { useLive } from '../useLive';
import { Empty, ErrorLine, Kpi, LiveChip, Loading, PageHead, Panel, Status } from '../ui';

const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced'];

export default function Content() {
    const kb = useLive(fetchKnowledgeBase, 60_000);
    const gaps = useLive(adminGaps, 60_000);
    const ch = useLive(adminChallenges, 60_000);
    const [query, setQuery] = useState('');
    const [doc, setDoc] = useState<string | null>(null);
    const [drag, setDrag] = useState(false);
    const [upload, setUpload] = useState<{ busy: boolean; msg?: string; ok?: boolean }>({ busy: false });
    const fileRef = useRef<HTMLInputElement>(null);

    const have = new Set((kb.data?.documents ?? []).map((d) => d.id));
    const covered = DOMAINS.filter((d) => d.concepts.some((c) => have.has(c.id))).length;
    const docs = (kb.data?.documents ?? []).filter((d) => !query || `${d.title} ${d.domain} ${d.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    const k = ch.data?.min_group ?? 1;
    const top = gaps.data?.clusters[0];

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        setUpload({ busy: true });
        try {
            const r = await uploadDocument(file);
            const parts = [
                r.added.length && `${r.added.length} added`,
                r.updated.length && `${r.updated.length} updated`,
                r.unchanged.length && 'unchanged (already indexed)',
                r.duplicate_passages_dropped && `${r.duplicate_passages_dropped} duplicate passages dropped`,
                r.quarantined_spans && `${r.quarantined_spans} instruction-like spans removed`,
            ].filter(Boolean);
            setUpload({ busy: false, ok: true, msg: parts.join(' · ') || 'Done' });
            void kb.reload();
        } catch (e) {
            setUpload({ busy: false, ok: false, msg: e instanceof RagError ? e.message : 'Upload failed.' });
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <>
            <PageHead title="Content" sub="What the tutor can cite, how much of the roadmap it covers, and what learners asked that it couldn't answer."
                right={<LiveChip updated={kb.updated} loading={kb.loading} onRefresh={() => { void kb.reload(); void gaps.reload(); void ch.reload(); }} />} />
            {kb.error && !kb.data && <ErrorLine text={kb.error} />}

            <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Documents" value={num(kb.data?.stats.documents)} sub={`${num(kb.data?.stats.sections)} sections`} />
                <Kpi label="Passages" value={num(kb.data?.stats.passages)} sub="citable chunks" />
                <Kpi label="Roadmap covered" value={kb.data ? `${covered} / ${DOMAINS.length}` : '–'} sub="domains with a source" />
                <Kpi label="Refused questions" value={num(gaps.data?.total)} sub={`kept ${gaps.data?.retention_days ?? 90} days, no identity`} />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.15fr_1fr_1fr]">
                {/* knowledge base */}
                <Panel title="Knowledge base" cap={kb.data ? `embedder ${kb.data.embedder} · reranker ${kb.data.reranker}` : undefined} className="min-h-[420px] xl:min-h-0">
                    <label htmlFor="kb-file"
                        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                        onDrop={(e) => { e.preventDefault(); setDrag(false); void onFile(e.dataTransfer.files?.[0]); }}
                        className="flex cursor-pointer flex-col items-center gap-1 rounded-[12px] border border-dashed px-3 py-3.5 text-center transition-colors"
                        style={{ borderColor: 'var(--a-line-strong)', background: drag ? 'var(--a-gold-soft)' : 'var(--a-surface-2)' }}>
                        {upload.busy ? <Loader2 className="h-5 w-5 animate-spin a-gold" aria-hidden /> : <FileUp className="h-5 w-5 a-gold" aria-hidden />}
                        <b className="a-ink text-xs">{upload.busy ? 'Ingesting…' : 'Drop a source, or click to choose'}</b>
                        <span className="a-muted text-[10px]">.md, .txt or .pdf up to 2 MB. Parsed, de-duplicated, scanned for injection, chunked, embedded and versioned.</span>
                        <input id="kb-file" ref={fileRef} type="file" accept=".md,.markdown,.txt,.pdf" disabled={upload.busy} className="sr-only"
                            onChange={(e) => void onFile(e.target.files?.[0])} />
                    </label>
                    {upload.msg && <p role={upload.ok ? 'status' : 'alert'} className="mt-2 text-[11px] font-semibold" style={{ color: upload.ok ? 'var(--a-mint)' : 'var(--critical)' }}>{upload.msg}</p>}
                    <div className="relative my-2.5">
                        <Search className="a-muted pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" aria-hidden />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title, domain or tag" aria-label="Filter documents" className="a-input" />
                    </div>
                    {!kb.data ? <Loading /> : docs.length === 0 ? <Empty>No documents match.</Empty> : (
                        <ul className="space-y-1.5">
                            {docs.map((d) => (
                                <li key={d.id} className="a-row cursor-pointer !py-1.5" role="button" tabIndex={0} title="Read its passages" onClick={() => setDoc(d.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDoc(d.id); } }}>
                                    <div className="flex items-center gap-2 text-[11px]">
                                        <b className="a-ink truncate">{d.title}</b>
                                        <span className="a-cap ml-auto shrink-0 !text-[9px]">{LEVELS[d.level]}</span>
                                        <span className="a-num a-muted shrink-0 text-[10px]">v{d.version}</span>
                                    </div>
                                    <p className="a-muted truncate text-[10px]">{d.domain}{d.prerequisites.length ? ` · needs ${d.prerequisites.join(', ')}` : ''}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                {/* roadmap coverage */}
                <Panel title="Roadmap coverage" cap="The 22 domains of curriculum/dsa_roadmap.md against the sources that exist" className="min-h-[420px] xl:min-h-0">
                    <ul className="space-y-1">
                        {DOMAINS.map((d) => {
                            const present = d.concepts.filter((c) => have.has(c.id));
                            return (
                                <li key={d.n} className="a-row flex items-center gap-2 !py-1.5 text-[11px]">
                                    <span className="a-num a-muted w-5 shrink-0 text-right">{d.n}</span>
                                    <span className="min-w-0 flex-1">
                                        <b className="a-ink block truncate">{d.name}</b>
                                        <span className="a-muted block truncate text-[10px]">{present.length ? present.map((c) => c.title).join(', ') : 'No source yet'}</span>
                                    </span>
                                    <Status level={present.length ? 'good' : 'idle'} label={present.length ? `${present.length} doc${present.length > 1 ? 's' : ''}` : 'Planned'} />
                                </li>
                            );
                        })}
                    </ul>
                </Panel>

                <div className="flex min-h-0 flex-col gap-3">
                    <Panel title="Content gaps" cap="Refused questions grouped by meaning: what to write next" className="min-h-[240px] flex-1 xl:min-h-0">
                        {!gaps.data ? (gaps.error ? <ErrorLine text={gaps.error} /> : <Loading />) : gaps.data.clusters.length === 0 ? (
                            <Empty>No refused questions yet: every question so far had enough evidence.</Empty>
                        ) : (
                            <>
                                {top && (
                                    <div className="a-row mb-2 text-[11px]" style={{ background: 'var(--a-gold-soft)' }}>
                                        <p className="a-cap mb-1">Next source to write</p>
                                        <ol className="a-ink-2 list-decimal space-y-0.5 pl-4">
                                            <li>Write <code>data/knowledge/&lt;id&gt;.md</code> covering &ldquo;{top.topic}&rdquo;.</li>
                                            <li>Front matter: <code>id, title, domain, level, prerequisites, tags</code>{top.closest_concept ? <>; likely prerequisite: <b className="a-ink">{top.closest_concept.title}</b></> : null}.</li>
                                            <li>Upload it here, then ask the question again: it should now be grounded.</li>
                                        </ol>
                                    </div>
                                )}
                                <ul className="space-y-1.5">
                                    {gaps.data.clusters.map((g) => (
                                        <li key={g.topic} className="a-row text-[11px]">
                                            <p className="flex items-center gap-2"><b className="a-num a-gold shrink-0">{g.count}×</b><b className="a-ink truncate">{g.topic}</b></p>
                                            {g.closest_concept && <p className="a-muted mt-0.5">Closest: {g.closest_concept.title} ({pct(g.closest_concept.similarity)} similar). {g.suggestion}.</p>}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Panel>
                    <Panel title="Challenges" cap="Sandbox-graded debugging and coding challenges" className="min-h-[220px] flex-1 xl:min-h-0">
                        {!ch.data ? <Loading /> : (
                            <table className="w-full text-[11px]">
                                <caption className="sr-only">Challenge results</caption>
                                <thead><tr className="a-cap text-left"><th className="pb-1 font-bold">Challenge</th><th className="pb-1 text-right font-bold">Tried</th><th className="pb-1 text-right font-bold">Passed</th><th className="pb-1 text-right font-bold">Fails</th></tr></thead>
                                <tbody>
                                    {ch.data.challenges.map((c) => (
                                        <tr key={c.id} style={{ borderTop: '1px solid var(--a-line)' }}>
                                            <td className="py-1 pr-2"><span className="a-ink block max-w-[11rem] truncate font-semibold">{c.title}</span><span className="a-muted text-[10px]">{c.kind} · {c.concept}</span></td>
                                            <td className="a-num a-ink text-right">{gated(c.tried, k)}</td>
                                            <td className="a-num a-ink text-right">{c.pass_rate == null ? gated(c.passed, k) : pct(c.pass_rate)}</td>
                                            <td className="a-num a-ink-2 text-right">{c.mean_fails ?? '–'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Panel>
                </div>
            </div>
            <DocumentDrawer id={doc} onClose={() => setDoc(null)} />
        </>
    );
}
