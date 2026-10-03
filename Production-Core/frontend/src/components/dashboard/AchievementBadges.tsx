import { motion } from 'framer-motion';
import { Trophy, Flame, Zap, Star, Target, BookOpen, type LucideIcon } from 'lucide-react';

export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string;
    earned: boolean;
    progress?: number;
    maxProgress?: number;
}

const ICON_MAP: Record<string, LucideIcon> = {
    trophy: Trophy,
    flame: Flame,
    zap: Zap,
    star: Star,
    target: Target,
    book: BookOpen,
};

export default function AchievementBadges({ achievements }: { achievements: Achievement[] }) {
    return (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Achievements">
            {achievements.map((a, idx) => {
                const Icon = ICON_MAP[a.icon] ?? Star;
                const pct = a.maxProgress ? Math.round(((a.progress ?? 0) / a.maxProgress) * 100) : 0;
                return (
                    <motion.li
                        key={a.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05, type: 'spring', damping: 16 }}
                        className={`flex flex-col items-center rounded-[18px] border-2 p-3.5 text-center ${
                            a.earned ? 'badge-earned border-[var(--max-line)] shadow-[3px_3px_0_var(--max-line)]' : 'border-dashed border-[rgb(var(--c-navy)/0.18)]'
                        }`}
                    >
                        <span
                            className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                                a.earned ? 'border-[var(--max-line)] bg-[#f3dc8f] text-[#1b1405]' : 'border-dashed border-[rgb(var(--c-navy)/0.2)] text-campus-warm-400'
                            }`}
                        >
                            <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <p className="font-heading text-[12.5px] font-bold text-campus-navy">{a.title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-campus-warm-500">{a.description}</p>
                        {a.earned ? (
                            <span className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-campus-success">Earned</span>
                        ) : (
                            <div className="mt-2 w-full">
                                <div
                                    className="h-1.5 w-full rounded bg-campus-warm-100"
                                    role="progressbar"
                                    aria-valuenow={a.progress ?? 0}
                                    aria-valuemin={0}
                                    aria-valuemax={a.maxProgress ?? 1}
                                    aria-label={`${a.title} progress`}
                                >
                                    <div className="h-1.5 rounded bg-campus-gold" style={{ width: `${pct}%` }} />
                                </div>
                                <p className="mt-1 text-[11px] text-campus-warm-300">
                                    {a.progress ?? 0} / {a.maxProgress ?? 1}
                                </p>
                            </div>
                        )}
                    </motion.li>
                );
            })}
        </ul>
    );
}
