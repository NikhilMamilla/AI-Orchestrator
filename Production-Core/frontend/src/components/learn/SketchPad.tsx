import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Eraser, Loader2, PencilRuler, Trash2, Undo2 } from 'lucide-react';
import { checkSketch, type SketchResult, type SketchKind } from '../../lib/learning';
import { RagError } from '../../lib/rag';

const KINDS: { id: SketchKind; label: string; hint: string }[] = [
    { id: 'bst', label: 'Binary search tree', hint: 'Draw circles with numbers and lines from each parent down to its children, e.g. a BST of 8, 3, 10, 1, 6.' },
    { id: 'min-heap', label: 'Min-heap', hint: 'Draw the heap as a tree: the smallest value at the top, filling each level left to right.' },
    { id: 'max-heap', label: 'Max-heap', hint: 'Draw the heap as a tree: the largest value at the top, filling each level left to right.' },
];
const W = 720;
const H = 440;

type Stroke = { erase: boolean; pts: [number, number][] };

/** Draw a tree by hand. A vision model only reads it; fixed rules decide whether it is a valid BST or heap. */
export default function SketchPad() {
    const canvas = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<Stroke[]>([]);
    const current = useRef<Stroke | null>(null);
    const [kind, setKind] = useState<SketchKind>('bst');
    const [erase, setErase] = useState(false);
    const [empty, setEmpty] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [res, setRes] = useState<SketchResult | null>(null);

    const paint = useCallback(() => {
        const c = canvas.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) {
            ctx.strokeStyle = s.erase ? '#ffffff' : '#14141a';
            ctx.lineWidth = s.erase ? 26 : 3.5;
            ctx.beginPath();
            s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
            ctx.stroke();
        }
    }, []);
    useEffect(paint, [paint]);

    const at = (e: React.PointerEvent): [number, number] => {
        const r = canvas.current!.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    const down = (e: React.PointerEvent) => {
        canvas.current?.setPointerCapture(e.pointerId);
        current.current = { erase, pts: [at(e)] };
        setRes(null);
        paint();
    };
    const move = (e: React.PointerEvent) => {
        if (!current.current) return;
        current.current.pts.push(at(e));
        paint();
    };
    const up = () => {
        if (!current.current) return;
        strokes.current.push(current.current);
        current.current = null;
        setEmpty(!strokes.current.some((s) => !s.erase));
        paint();
    };
    const undo = () => { strokes.current.pop(); setEmpty(!strokes.current.some((s) => !s.erase)); setRes(null); paint(); };
    const clear = () => { strokes.current = []; setEmpty(true); setRes(null); setError(null); paint(); };

    const submit = async () => {
        if (!canvas.current) return;
        setBusy(true);
        setError(null);
        try {
            setRes(await checkSketch(kind, canvas.current.toDataURL('image/png')));
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not check your drawing right now.');
        } finally {
            setBusy(false);
        }
    };

    const k = KINDS.find((x) => x.id === kind)!;
    return (
        <section className="campus-card mb-8 p-5" aria-labelledby="sk-h">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-campus-sm bg-campus-gold/10 text-campus-gold-dark"><PencilRuler className="h-5 w-5" aria-hidden /></span>
                <div>
                    <h2 id="sk-h" className="text-lg">Draw it</h2>
                    <p className="text-sm text-campus-warm-400">Sketch a tree on paper-white and get it checked. A vision model reads your drawing and shows what it saw; fixed rules, not the model, decide if it is valid.</p>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Structure">
                {KINDS.map((x) => (
                    <button key={x.id} type="button" role="radio" aria-checked={kind === x.id} onClick={() => { setKind(x.id); setRes(null); }}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${kind === x.id ? 'border-campus-gold bg-campus-gold/15 text-campus-navy' : 'border-campus-warm-200 text-campus-warm-500 hover:border-campus-gold/60'}`}>
                        {x.label}
                    </button>
                ))}
            </div>
            <p className="mt-2 text-xs text-campus-warm-400">{k.hint}</p>

            <div className="mt-3 overflow-hidden rounded-campus-sm border border-campus-warm-200 bg-white shadow-campus">
                <canvas ref={canvas} width={W} height={H} aria-label="Drawing area. Draw with a pen, finger or mouse."
                    className="block h-auto w-full cursor-crosshair touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setErase((v) => !v)} aria-pressed={erase}
                    className={`inline-flex items-center gap-1.5 rounded-campus-sm border px-3 py-2 text-sm ${erase ? 'border-campus-gold bg-campus-gold/15 text-campus-navy' : 'border-campus-warm-200 text-campus-warm-500'}`}>
                    <Eraser className="h-4 w-4" aria-hidden /> Eraser
                </button>
                <button type="button" onClick={undo} className="inline-flex items-center gap-1.5 rounded-campus-sm border border-campus-warm-200 px-3 py-2 text-sm text-campus-warm-500"><Undo2 className="h-4 w-4" aria-hidden /> Undo</button>
                <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 rounded-campus-sm border border-campus-warm-200 px-3 py-2 text-sm text-campus-warm-500"><Trash2 className="h-4 w-4" aria-hidden /> Clear</button>
                <button type="button" onClick={() => void submit()} disabled={busy || empty} className="campus-btn-primary ml-auto px-4 py-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Check my drawing
                </button>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-campus-rose">{error}</p>}

            {res && (
                <div className="mt-5 space-y-4" role="status" aria-live="polite">
                    <div>
                        <h3 className="text-sm font-semibold text-campus-navy">What I read from your drawing</h3>
                        {res.reading.outline
                            ? <pre className="mt-2 overflow-x-auto rounded-campus-sm bg-campus-navy/5 p-3 font-mono text-xs text-campus-navy">{res.reading.outline}</pre>
                            : <p className="mt-1 text-sm text-campus-warm-400">{res.reading.nodes} node(s) found, but they do not form a single tree.</p>}
                        <p className="mt-1 text-xs text-campus-warm-400">If this is not what you drew, the reader made a mistake. Redraw larger and clearer. It is never treated as your mistake.</p>
                    </div>
                    {!res.reliable ? (
                        <p className="rounded-campus-sm bg-campus-amber/10 p-3 text-sm text-campus-navy">
                            <strong>I could not read this reliably.</strong> Two separate readings of your drawing disagreed, so I will not give a verdict that might be my own misreading. Try drawing the circles and numbers larger and the lines clearer.
                        </p>
                    ) : (
                    <div className={`flex gap-2 rounded-campus-sm p-3 text-sm ${res.ok ? 'bg-campus-success/10 text-campus-navy' : 'bg-campus-rose/10 text-campus-navy'}`}>
                        {res.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-campus-success" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-campus-rose" aria-hidden />}
                        <div>
                            <strong>{res.ok ? `Valid ${k.label.toLowerCase()}.` : 'Something is off.'}</strong>
                            {res.findings.length > 0 && <ul className="mt-1 list-disc space-y-1 pl-5">{res.findings.map((f, i) => <li key={i}>{f.message}</li>)}</ul>}
                        </div>
                    </div>
                    )}
                </div>
            )}
        </section>
    );
}
