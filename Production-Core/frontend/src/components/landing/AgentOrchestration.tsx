import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
    Brain, BookOpen, Library,
    ClipboardCheck, TrendingUp,
    Terminal, Play, Pause, RotateCcw,
    Activity,
    type LucideIcon,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
   TYPES & CONFIG
   ═══════════════════════════════════════════════════════════ */

type AgentStatus = 'idle' | 'active' | 'thinking' | 'sending' | 'receiving';

interface AgentNode {
    id: string;
    label: string;
    subLabel: string;
    icon: LucideIcon;
    color: string;
    x: number; // percentage (0-100)
    y: number; // percentage (0-100)
}

interface LogEntry {
    id: string;
    timestamp: string;
    agent: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

const AGENTS: AgentNode[] = [
    { id: 'orchestrator', label: 'Orchestrator', subLabel: 'The Main Brain', icon: Brain, color: '#FF6D5A', x: 50, y: 50 },
    { id: 'knowledge', label: 'Knowledge', subLabel: 'Digital Library', icon: Library, color: '#2CBB5C', x: 20, y: 30 },
    { id: 'tutor', label: 'Teaching', subLabel: 'Personal Teacher', icon: BookOpen, color: '#465BB3', x: 80, y: 30 },
    { id: 'evaluator', label: 'Assessment', subLabel: 'Smart Grader', icon: ClipboardCheck, color: '#E0B312', x: 20, y: 70 },
    { id: 'analyst', label: 'Analyst', subLabel: 'Student Profiler', icon: TrendingUp, color: '#8D56F5', x: 80, y: 70 },
];

const SCENARIOS = [
    {
        id: 'new_concept',
        label: 'Topic: Binary Search',
        steps: [
            { from: 'orchestrator', to: 'analyst', msg: 'Checking profile for Binary Search lesson...' },
            { from: 'analyst', to: 'orchestrator', msg: 'Student prefers analogies over complex math.' },
            { from: 'orchestrator', to: 'knowledge', msg: 'Retrieve core Binary Search concepts.' },
            { from: 'knowledge', to: 'orchestrator', msg: 'Found: O(log N) search logic & base cases.' },
            { from: 'orchestrator', to: 'tutor', msg: 'Generate an analogy-based explanation.' },
            { from: 'tutor', to: 'orchestrator', msg: 'Lesson ready: The "Dictionary" splitting method.' },
        ]
    },
    {
        id: 'misconception',
        label: 'Fixing: Array Errors',
        steps: [
            { from: 'evaluator', to: 'orchestrator', msg: 'Detected: Off-by-one boundary error.' },
            { from: 'orchestrator', to: 'analyst', msg: 'Is this a persistent knowledge gap?' },
            { from: 'analyst', to: 'orchestrator', msg: 'Yes, student often confuses index 0 vs 1.' },
            { from: 'orchestrator', to: 'tutor', msg: 'Provide a visual aid on array indexing.' },
            { from: 'tutor', to: 'orchestrator', msg: 'Assigned: Visual mapping of index vs value.' },
            { from: 'orchestrator', to: 'knowledge', msg: 'Fetch a practice challenge for indexing.' },
        ]
    }
];

/* ═══════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════ */

const DirectedConnection = ({ from, to, active, id }: { from: AgentNode, to: AgentNode, active: boolean, id: string }) => {
    const midX = (from.x + to.x) / 2;
    const pathD = `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;

    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
                <marker id={`arrowhead-${id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8" fill={active ? "#C8A951" : "#CBD5E1"} />
                </marker>
            </defs>

            <path
                d={pathD}
                fill="none"
                stroke={active ? "#C8A951" : "#CBD5E1"}
                strokeWidth={active ? "1.5" : "0.8"}
                strokeDasharray={active ? "none" : "2 2"}
                markerEnd={`url(#arrowhead-${id})`}
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-700"
            />

            {active && (
                <motion.circle r="0.8" fill="#C8A951" style={{ filter: 'blur(0.5px)' }}>
                    <animateMotion dur="1s" repeatCount="1" fill="freeze" path={pathD} />
                </motion.circle>
            )}
        </svg>
    );
};

const WorkflowNode = ({ agent, status }: { agent: AgentNode; status: AgentStatus }) => {
    const isActive = status !== 'idle';
    return (
        <div className="absolute -translate-x-1/2 -translate-y-1/2 z-20" style={{ left: `${agent.x}%`, top: `${agent.y}%` }}>
            <motion.div
                animate={isActive ? { scale: 1.05, y: -3, boxShadow: "0 10px 20px -5px rgba(0,0,0,0.1)" } : { scale: 1, y: 0 }}
                className={`w-[125px] xs:w-36 md:w-44 bg-campus-surface rounded-lg shadow-sm border overflow-hidden transition-all duration-300 ${isActive ? 'border-campus-gold ring-2 ring-campus-gold/20' : 'border-campus-warm-100'}`}
            >
                <div className="h-1 md:h-1.5" style={{ backgroundColor: agent.color }} />
                <div className="p-2 md:p-3">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className={`w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${isActive ? 'bg-campus-primary text-white shadow-sm font-bold' : 'bg-campus-warm-50 text-campus-warm-400'}`}>
                            <agent.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-heading font-semibold text-[11px] md:text-[13px] text-campus-navy truncate leading-tight">{agent.label}</h4>
                            <p className="text-[9px] md:text-[10px] font-accent text-campus-warm-400 tracking-tight truncate mt-0.5">{agent.subLabel}</p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function AgentOrchestration() {
    const [activeScenario, setActiveScenario] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const containerRef = useRef(null);
    const isInView = useInView(containerRef, { once: true, margin: "-100px" });
    const terminalRef = useRef<HTMLDivElement>(null);

    const restartCurrent = () => {
        setCurrentStep(0);
        setLogs([]);
        setIsPlaying(true);
    };

    useEffect(() => {
        if (isInView && !isPlaying && currentStep === 0) setIsPlaying(true);
    }, [isInView]);

    useEffect(() => {
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }, [logs]);

    useEffect(() => {
        if (!isPlaying) return;
        if (currentStep >= SCENARIOS[activeScenario].steps.length) {
            const restartTimer = setTimeout(() => { setCurrentStep(0); setLogs([]); }, 4500);
            return () => clearTimeout(restartTimer);
        }
        const step = SCENARIOS[activeScenario].steps[currentStep];
        const newLog: LogEntry = {
            id: Math.random().toString(36),
            timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            agent: step.from.toUpperCase(),
            message: step.msg,
            type: 'info'
        };
        setLogs(prev => [...prev.slice(-15), newLog]);
        const timer = setTimeout(() => { setCurrentStep(prev => prev + 1); }, 2500);
        return () => clearTimeout(timer);
    }, [isPlaying, currentStep, activeScenario]);

    const changeScenario = (index: number) => {
        setActiveScenario(index);
        setCurrentStep(0);
        setLogs([]);
        setIsPlaying(true);
    };

    const activeStepData = currentStep < SCENARIOS[activeScenario].steps.length ? SCENARIOS[activeScenario].steps[currentStep] : null;

    return (
        <div ref={containerRef} className="flex flex-col h-[650px] md:h-[750px] w-full bg-campus-surface rounded-2xl border border-campus-warm-200 shadow-xl overflow-hidden font-body">

            <div className="relative flex-grow bg-[#FAFAFA] overflow-hidden">
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)', backgroundSize: '16px 16px md:24px 24px' }} />

                <div className="absolute top-3 md:top-5 left-3 md:left-5 right-3 md:right-5 z-40 flex flex-col sm:flex-row justify-between items-center gap-3 pointer-events-none">
                    <div className="pointer-events-auto bg-campus-surface border border-campus-warm-200 p-1 rounded-xl shadow-lg flex gap-0.5 md:gap-1">
                        {SCENARIOS.map((s, i) => (
                            <button key={s.id} onClick={() => changeScenario(i)} className={`px-2 md:px-4 py-1.5 md:py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${activeScenario === i ? 'bg-campus-primary text-white shadow-md' : 'text-campus-warm-400 hover:bg-campus-warm-50'}`}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                    <div className="pointer-events-auto bg-campus-surface border border-campus-warm-200 p-1 rounded-xl shadow-lg flex gap-1">
                        <button type="button" aria-label={isPlaying ? 'Pause the walkthrough' : 'Play the walkthrough'} onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-lg hover:bg-campus-warm-50 text-campus-navy">
                            {isPlaying ? <Pause className="w-4 h-4 md:w-5 md:h-5 fill-current" /> : <Play className="w-4 h-4 md:w-5 md:h-5 ml-0.5 fill-current" />}
                        </button>
                        <button type="button" aria-label="Restart the walkthrough" onClick={restartCurrent} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-lg hover:bg-campus-warm-50 text-campus-warm-500 transition-colors">
                            <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                    </div>
                </div>

                <div className="absolute inset-0 top-24 sm:top-16">
                    {AGENTS.map(agent => {
                        if (agent.id === 'orchestrator') return null;
                        const orch = AGENTS.find(a => a.id === 'orchestrator')!;
                        const isCurrentActive = activeStepData && (
                            (activeStepData.from === orch.id && activeStepData.to === agent.id) ||
                            (activeStepData.from === agent.id && activeStepData.to === orch.id)
                        );
                        return (
                            <DirectedConnection key={`path-${agent.id}`} from={orch} to={agent} active={!!isCurrentActive} id={`path-${agent.id}`} />
                        );
                    })}

                    {AGENTS.map(agent => (
                        <WorkflowNode key={agent.id} agent={agent} status={activeStepData?.from === agent.id ? 'sending' : activeStepData?.to === agent.id ? 'receiving' : 'idle'} />
                    ))}
                </div>
            </div>

            <div className="h-[240px] md:h-[300px] bg-black border-t-2 border-campus-warm-200 flex flex-col shrink-0 relative z-50">
                <div className="flex items-center justify-between px-5 py-4 bg-[#111] border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <Terminal className="w-4 h-4 text-green-500" />
                        <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-widest">Orchestrator-v1.0.42.log</span>
                    </div>
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                    </div>
                </div>

                <div ref={terminalRef} tabIndex={0} role="log" aria-label="Walkthrough log" className="flex-1 p-6 font-mono text-xs md:text-[13px] overflow-y-auto bg-black scrollbar-hide">
                    {logs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-800 italic gap-2">
                            <Activity className="w-8 h-8 opacity-20 animate-pulse" />
                            <p>Initializing Kiddoo Engine...</p>
                        </div>
                    ) : (
                        <div className="space-y-3.5">
                            {logs.map((log) => (
                                <motion.div key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                                    <span className="text-gray-700 shrink-0 w-16 md:w-20 text-right font-light">[{log.timestamp}]</span>
                                    <div className="flex-1 text-gray-300">
                                        <span className="text-green-900 mr-2 opacity-50 select-none">#</span>
                                        <span className="uppercase font-bold text-[8px] md:text-[9px] tracking-widest mr-2 md:mr-4 px-1.5 md:px-2 py-0.5 rounded-sm border border-white/5" style={{ color: AGENTS.find(a => a.id.toUpperCase() === log.agent)?.color }}>
                                            {log.agent}
                                        </span>
                                        <span className={log.agent === 'ORCHESTRATOR' ? 'text-white' : 'text-gray-400'}>{log.message}</span>
                                    </div>
                                </motion.div>
                            ))}
                            <div className="flex gap-4 pt-4"><span className="text-transparent w-20 invisible">00:00:00</span>
                                <div className="flex items-center gap-2"><span className="text-green-900 mr-2 opacity-50 select-none">#</span><span className="w-2.5 h-5 bg-campus-gold/80 block animate-pulse" /></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
