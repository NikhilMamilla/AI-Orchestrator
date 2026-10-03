import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { createShare, listShares, revokeShare, type ShareLink } from '../../lib/share';

/** The student decides who sees their progress: create a named, expiring, revocable link.
 *  `bare`: no card and no heading of its own (the page frames it), in the app's pill style. */
export default function ShareManager({ bare = false }: { bare?: boolean }) {
    const [links, setLinks] = useState<ShareLink[]>([]);
    const [label, setLabel] = useState('');
    const [fresh, setFresh] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        listShares().then(setLinks).catch(() => setError('Could not load your links.'));
    }, []);
    useEffect(load, [load]);

    const create = async () => {
        setError(null);
        try {
            const c = await createShare(label.trim(), 30);
            setFresh(`${window.location.origin}${c.path}`);
            setLabel('');
            setCopied(false);
            load();
        } catch {
            setError('Could not create the link.');
        }
    };

    return (
        <section className={bare ? 'print:hidden' : 'campus-card mt-6 p-5 print:hidden'} aria-labelledby={bare ? undefined : 'share-h'} aria-label={bare ? 'Share with a teacher or parent' : undefined}>
            {!bare && <h2 id="share-h" className="mb-1 flex items-center gap-2 text-lg"><Share2 className="h-5 w-5 text-campus-gold" aria-hidden /> Share with a teacher or parent</h2>}
            <p className={bare ? 'mb-4 text-xs leading-relaxed text-campus-warm-500' : 'mb-3 text-xs text-campus-warm-400'}>
                Creates a read-only link that expires in 30 days. It shows progress numbers and gentle alerts with suggestions, never your answers or questions. You can turn it off any time.
            </p>
            <form className={bare ? 'flex flex-wrap items-center gap-2.5' : 'flex flex-wrap gap-2'} onSubmit={(e) => { e.preventDefault(); void create(); }}>
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Who is it for? (e.g. Ms. Rao)" aria-label="Who is this link for"
                    className={bare ? 'share-input min-w-[10rem] flex-1' : 'min-w-[12rem] flex-1 rounded-campus-sm border border-campus-warm-200 bg-campus-surface px-2.5 py-2 text-sm'} />
                <button type="submit" className={bare ? 'btn-skeu h-10 shrink-0 px-4 text-xs' : 'campus-btn-primary px-4 py-2'}>Create link</button>
            </form>
            {error && <p role="alert" className="mt-2 text-sm text-campus-rose">{error}</p>}
            {fresh && (
                <div className="mt-3 rounded-campus-sm bg-campus-gold-light p-3 text-sm" role="status">
                    <p className="mb-1 font-semibold text-campus-navy">Copy it now: it won&apos;t be shown again.</p>
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs">{fresh}</code>
                        <button type="button" onClick={() => { void navigator.clipboard.writeText(fresh); setCopied(true); }} className="campus-btn bg-campus-surface px-2.5 py-1.5 text-campus-navy ring-1 ring-campus-warm-200">
                            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            )}
            {links.length > 0 && (
                <ul className="mt-3 divide-y divide-campus-warm-100 text-sm">
                    {links.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                            <span className="min-w-0 flex-1">
                                <strong className="text-campus-navy">{l.label || 'Unnamed link'}</strong>
                                <span className="ml-2 text-xs text-campus-warm-400">expires {new Date(l.expires_at).toLocaleDateString()} · viewed {l.views}×</span>
                            </span>
                            <button type="button" onClick={() => { void revokeShare(l.id).then(load); }} className="text-sm text-campus-rose underline">Turn off</button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
