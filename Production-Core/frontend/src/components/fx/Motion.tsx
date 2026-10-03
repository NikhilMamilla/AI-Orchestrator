import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';

/** Words fade in with a blur, one after another (React Bits style "blur text"). */
export function BlurText({ text, className = '', wordClassName = '', delay = 0, as: Tag = 'span' }: { text: string; className?: string; wordClassName?: string; delay?: number; as?: 'span' | 'h1' | 'h2' | 'p' }) {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: '-60px' });
    const reduce = useReducedMotion();
    const words = text.split(' ');
    return (
        <Tag ref={ref as never} className={className}>
            <span className="sr-only">{text}</span>
            {words.map((w, i) => (
                <motion.span
                    key={i}
                    aria-hidden
                    className={`inline-block ${wordClassName}`}
                    initial={reduce ? false : { opacity: 0, filter: 'blur(12px)', y: 14 }}
                    animate={inView || reduce ? { opacity: 1, filter: 'blur(0px)', y: 0 } : undefined}
                    transition={{ duration: 0.6, delay: delay + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                >
                    {w}{i < words.length - 1 ? ' ' : ''}
                </motion.span>
            ))}
        </Tag>
    );
}

/** Counts up to `value` once when scrolled into view. */
export function CountUp({ value, suffix = '', decimals = 0, className = '' }: { value: number; suffix?: string; decimals?: number; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true });
    const reduce = useReducedMotion();
    const [n, setN] = useState(reduce ? value : 0);
    useEffect(() => {
        if (!inView || reduce) return;
        const c = animate(0, value, { duration: 1.6, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setN(v) });
        return () => c.stop();
    }, [inView, value, reduce]);
    return <span ref={ref} className={className}>{n.toFixed(decimals)}{suffix}</span>;
}

/** Infinite horizontal ticker; pauses on hover and fades at the edges. */
export function Marquee({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`group relative flex overflow-hidden mask-fade-x ${className}`}>
            <div className="flex min-w-max shrink-0 animate-marquee items-center gap-4 pr-4 group-hover:[animation-play-state:paused]">{children}</div>
            <div aria-hidden className="flex min-w-max shrink-0 animate-marquee items-center gap-4 pr-4 group-hover:[animation-play-state:paused]">{children}</div>
        </div>
    );
}

/** Scroll-reveal wrapper. */
export function Reveal({ children, delay = 0, className = '', y = 28 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '-70px' });
    const reduce = useReducedMotion();
    if (typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches) return <div className={className}>{children}</div>;   // phones: no reveal on scroll
    return (
        <motion.div ref={ref} className={className} initial={reduce ? false : { opacity: 0, y }} animate={inView || reduce ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}>
            {children}
        </motion.div>
    );
}

/** A beam of light that orbits the border of its (relatively positioned) parent. */
export function BorderBeam({ className = '' }: { className?: string }) {
    return <span aria-hidden data-fx className={`border-beam ${className}`} />;
}
