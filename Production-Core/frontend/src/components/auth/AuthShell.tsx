import GoogleLogo from './GoogleLogo';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowLeft, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { Script } from '../fx/ScriptWord';
import ThemeToggle from '../fx/ThemeToggle';

/**
 * The frame of the sign-in and sign-up pages, in the landing story's language: on wide screens the story's sky with
 * the "Every learner is different" title card and three facts from the README, the form on the right in a sticker
 * card. Always one screen tall, never scrolls; in both themes.
 */
export function AuthShell({ title, mark, subtitle, error, children, footer }: {
    title: string; mark: string; subtitle: string; error: string; children: ReactNode; footer: ReactNode;
}) {
    return (
        <div className="auth world world-sky relative flex h-[100svh] min-h-[600px] overflow-hidden max-lg:fixed max-lg:inset-0 max-lg:h-auto max-lg:min-h-0">
            <div aria-hidden className="world-layer sky-rays" />
            <div aria-hidden className="world-layer">{Array.from({ length: 34 }, (_, i) => {
                // the same fall as the top of the landing page: a lane each, neighbours far apart in time, three sizes and colours
                const N = 34, size = [0.7, 1, 1.45][i % 3], tone = ['', ' petal-white', ' petal-deep'][(i * 7) % 3];
                const dur = (24 - size * 6) + (i % 5) * 1.5, phase = ((i * 13) % N) / N;
                return <span key={i} className={`petal${tone}`} style={{ left: `${((i + 0.5) / N) * 100}%`, width: `${16 * size}px`, height: `${10 * size}px`, opacity: 0.55 + size * 0.25, animationDelay: `${-phase * dur}s`, animationDuration: `${dur}s`, animationName: i % 2 ? 'petalFall' : 'petalFallAlt' }} />;
            })}</div>

            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8">
                <Link to="/" className="group flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[var(--max-line)] bg-gradient-to-br from-[#f3dc8f] to-[#c9a64a] text-[#1b1405] transition-transform group-hover:-rotate-12"><GraduationCap className="h-4 w-4" /></span>
                    <span className="font-heading text-lg font-bold text-campus-navy">Kiddoo</span>
                </Link>
                <div className="flex items-center gap-3">
                    <Link to="/" className="hidden items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-campus-navy/75 hover:text-campus-navy sm:flex"><ArrowLeft className="h-3.5 w-3.5" />Home</Link>
                    <ThemeToggle />
                </div>
            </div>

            {/* the story side (wide screens) */}
            <div className="relative hidden flex-1 flex-col items-center justify-center px-10 lg:flex">
                <div className="text-left" style={{ width: 'min(40vw, 80svh, 620px)', containerType: 'inline-size' }}>
                    <p className="ink-deep-flat ml-[34cqw] font-display text-[19cqw] font-semibold leading-none">Every</p>
                    <Script deep first="L" rest="earner" size="19cqw" className="-mt-[11cqw] ml-[4cqw]" />
                    <p className="ink-deep-flat mr-[22cqw] -mt-[6.5cqw] text-right font-display text-[6.4cqw] font-medium italic leading-none">is different.</p>
                </div>
                <p className="max-sub mt-7 max-w-md text-center" style={{ fontSize: 'clamp(1.25rem, 1.6vw, 1.6rem)' }}>So Kiddoo learns how you learn, from your own answers.</p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    {['Cites every claim', 'Refuses to guess', '5 agents plan with you'].map((t) => (
                        <span key={t} className="max-tag" style={{ fontSize: '12.5px', padding: '0.45rem 1.1rem' }}>{t}</span>
                    ))}
                </div>
            </div>

            {/* the form */}
            <div className="relative flex w-full items-center justify-center px-5 pb-6 pt-20 lg:w-[min(48vw,640px)] lg:pr-[7vw]">
                <motion.div initial={{ opacity: 0, y: 24, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: -0.6 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="auth-card w-full max-w-[480px] px-6 py-6 sm:px-10 sm:py-8">
                    <div className="text-center">
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(2rem, 4.2svh + 0.8rem, 2.8rem)', lineHeight: 1.28 }}>   {/* room between lines when it wraps */}
                            {title} <span className="max-mark">{mark}</span>
                        </h1>
                        <p className="max-sub mt-2" style={{ fontSize: '1.1rem' }}>{subtitle}</p>
                    </div>
                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                role="alert" className="mt-4 flex items-start gap-2.5 rounded-2xl border-2 border-campus-rose/40 bg-campus-rose-light px-3.5 py-2.5">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-campus-rose" />
                                <p className="text-sm text-campus-rose">{error}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <div className="mt-5">{children}</div>
                    <div className="mt-5 border-t-2 border-dashed border-[var(--max-line)]/20 pt-4 text-center text-sm text-campus-warm-500">{footer}</div>
                </motion.div>
            </div>
        </div>
    );
}

/** An input with its icon, in the auth card's inset style. */
export function AuthField({ icon: Icon, ...props }: { icon: React.ComponentType<{ className?: string }> } & React.InputHTMLAttributes<HTMLInputElement>) {
    const [shown, setShown] = useState(false);
    const secret = props.type === 'password';
    return (
        <label className="group relative block">
            <span className="sr-only">{props.placeholder}</span>
            <Icon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-campus-warm-400 transition-colors group-focus-within:text-campus-navy" />
            <input {...props} type={secret && shown ? 'text' : props.type} className={`auth-input ${secret ? '!pr-12' : ''}`} />
            {secret && (
                <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
                    className="auth-eye absolute inset-y-0 right-3 my-auto grid h-8 w-8 place-items-center rounded-full text-campus-warm-400 transition-colors hover:bg-campus-navy/5 hover:text-campus-navy">
                    {shown ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
                </button>
            )}
        </label>
    );
}

/** "or continue with" and the Google button. */
export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
    return (
        <>
            <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-campus-navy/15" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-campus-warm-400">or continue with</span>
                <span className="h-px flex-1 bg-campus-navy/15" />
            </div>
            <button type="button" onClick={onClick} disabled={disabled} className="btn-glass max-btn h-12 w-full justify-center text-sm disabled:opacity-50">
                <GoogleLogo />
                Google
            </button>
        </>
    );
}
