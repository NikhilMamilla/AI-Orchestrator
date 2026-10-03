import { Bot, Brain, Target, BookOpen, BarChart3, type LucideIcon } from 'lucide-react';

export interface AgentEvent {
    agent: string;
    action: string;
    timestamp: string; // ISO 8601
    type: 'orchestrator' | 'analyst' | 'tutor' | 'assessor' | 'motivator';
}

const AGENT_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
    orchestrator: { icon: Bot, color: 'text-campus-gold-dark', bg: 'bg-campus-gold/10' },
    analyst: { icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-500/10' },
    tutor: { icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    assessor: { icon: Target, color: 'text-orange-600', bg: 'bg-orange-500/10' },
    motivator: { icon: Brain, color: 'text-pink-600', bg: 'bg-pink-500/10' },
};

function timeAgo(iso: string): string {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function AgentActivityLog({ events }: { events: AgentEvent[] }) {
    return (
        <ul className="space-y-3" aria-label="Agent activity">
            {events.map((e, i) => {
                const cfg = AGENT_CONFIG[e.type] ?? AGENT_CONFIG.orchestrator;
                const Icon = cfg.icon;
                return (
                    <li key={`${e.timestamp}-${i}`} className="j-row flex items-start gap-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--max-line)] ${cfg.bg} ${cfg.color}`}>
                            <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-heading text-[13px] font-bold text-campus-navy">{e.agent}</p>
                            <p className="text-xs leading-relaxed text-campus-warm-500">{e.action}</p>
                        </div>
                        <time dateTime={e.timestamp} className="shrink-0 font-mono text-[10px] text-campus-warm-500">
                            {timeAgo(e.timestamp)}
                        </time>
                    </li>
                );
            })}
        </ul>
    );
}
