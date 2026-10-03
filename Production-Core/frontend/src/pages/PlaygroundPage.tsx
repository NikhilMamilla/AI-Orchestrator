import { useState, useEffect, useCallback } from 'react';
import { errorMessage } from '../lib/errors';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import { useDarkTheme } from '../hooks/useDarkTheme';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Play, RotateCcw, Terminal, Copy, CheckCheck,
    ChevronDown, Loader2, Clock, Cpu, AlertTriangle,
    Check, X, Keyboard
} from 'lucide-react';
import apiClient from '../lib/api';

interface Language {
    key: string;
    id: number;
    name: string;
    monaco: string;
    template: string;
}

interface ExecutionResult {
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    status: string;
    status_id: number;
    time: string | null;
    memory: number | null;
}

// language dot colours and file extensions
const LANG_COLOR: Record<string, string> = { python: '#3572A5', cpp: '#f34b7d', c: '#7d7d7d', javascript: '#f1e05a', typescript: '#3178c6', java: '#b07219', go: '#00add8', rust: '#dea584', php: '#4f5d95', ruby: '#a5332b', csharp: '#178600' };
const LANG_EXT: Record<string, string> = { python: '.py', cpp: '.cpp', c: '.c', javascript: '.js', typescript: '.ts', java: '.java', go: '.go', rust: '.rs', php: '.php', ruby: '.rb', csharp: '.cs' };

const FALLBACK_LANGUAGES: Language[] = [
    { key: 'python', id: 1, name: 'Python 3', monaco: 'python', template: '# Write your Python code here\n\ndef solution():\n    print("Hello from Kiddoo!")\n\nsolution()' },
    { key: 'javascript', id: 2, name: 'JavaScript', monaco: 'javascript', template: 'console.log("Hello from Kiddoo!");' },
    { key: 'typescript', id: 3, name: 'TypeScript', monaco: 'typescript', template: 'const message: string = "Hello from Kiddoo!";\nconsole.log(message);' },
    { key: 'java', id: 4, name: 'Java', monaco: 'java', template: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Kiddoo!");\n    }\n}' },
    { key: 'c', id: 5, name: 'C', monaco: 'c', template: '#include <stdio.h>\n\nint main() {\n    printf("Hello from Kiddoo!\\n");\n    return 0;\n}' },
    { key: 'cpp', id: 6, name: 'C++', monaco: 'cpp', template: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from Kiddoo!" << endl;\n    return 0;\n}' },
    { key: 'csharp', id: 7, name: 'C#', monaco: 'csharp', template: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello from Kiddoo!");\n    }\n}' },
    { key: 'go', id: 8, name: 'Go', monaco: 'go', template: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Kiddoo!")\n}' },
    { key: 'rust', id: 9, name: 'Rust', monaco: 'rust', template: 'fn main() {\n    println!("Hello from Kiddoo!");\n}' },
    { key: 'php', id: 10, name: 'PHP', monaco: 'php', template: '<?php\necho "Hello from Kiddoo!";' },
    { key: 'ruby', id: 11, name: 'Ruby', monaco: 'ruby', template: 'puts "Hello from Kiddoo!"' },
];

export default function PlaygroundPage() {
    const [languages, setLanguages] = useState<Language[]>(FALLBACK_LANGUAGES);
    const [selectedLang, setSelectedLang] = useState<Language>(FALLBACK_LANGUAGES[0]);
    const [code, setCode] = useState(FALLBACK_LANGUAGES[0].template);
    const [stdin, setStdin] = useState('');
    const [result, setResult] = useState<ExecutionResult | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showStdin, setShowStdin] = useState(true);
    const [langDropdownOpen, setLangDropdownOpen] = useState(false);
    const dark = useDarkTheme();

    useEffect(() => {
        apiClient.getLanguages().then((langs: Language[]) => {
            if (langs && langs.length > 0) {
                setLanguages(langs);
                setSelectedLang(langs[0]);
                setCode(langs[0].template);
            }
        }).catch(() => {
            // Use fallback languages
        });
    }, []);

    const handleLanguageChange = (lang: Language) => {
        setSelectedLang(lang);
        setCode(lang.template);
        setResult(null);
        setLangDropdownOpen(false);
    };

    const handleRun = useCallback(async () => {
        if (isRunning || !code.trim()) return;
        setIsRunning(true);
        setResult(null);

        try {
            const res = await apiClient.runCode(code, selectedLang.key, stdin);
            setResult(res);
        } catch (err) {
            const msg = errorMessage(err, 'Execution failed');
            setResult({
                stdout: null,
                stderr: msg,
                compile_output: null,
                status: 'Error',
                status_id: 13,
                time: null,
                memory: null,
            });
        } finally {
            setIsRunning(false);
        }
    }, [code, selectedLang, stdin, isRunning]);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Ctrl+Enter shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleRun();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleRun]);

    const getOutputContent = () => {
        if (!result) return null;
        if (result.compile_output) return result.compile_output;
        if (result.stderr) return result.stderr;
        if (result.stdout) return result.stdout;
        return '(No output)';
    };

    const statusTone = !result ? '#e9e3d3' : result.status_id === 3 ? '#bdeed6' : result.status_id === 4 ? '#f3dc8f' : '#ffd2c8';
    const outputTone = !result ? '' : result.status_id === 3 ? 'text-[#f6ecd2]' : result.compile_output ? 'text-[#ff9a8a]' : result.stderr ? 'text-[#ffc89a]' : 'text-[#f6ecd2]';

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: the editor on the left, input and output on the right */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Playground" subtitle="Run any code" />

                <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 md:flex-row md:items-end">
                    <div>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Try <span className="max-mark">anything.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>A scratchpad in {languages.length} languages. Your code runs for real in a sandbox, with your own input.</p>
                    </div>
                    <span className="hidden shrink-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-campus-warm-500 md:flex">
                        <Keyboard className="h-3.5 w-3.5" aria-hidden /> Ctrl + Enter to run
                    </span>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
                    {/* ── the editor ── */}
                    <section className="sticker flex min-h-[480px] flex-col p-3 lg:min-h-0" style={{ borderRadius: '28px 12px 28px 12px' }} aria-label="Code editor">
                        <div className="flex shrink-0 flex-wrap items-center gap-2 px-1 pb-3">
                            {/* language picker */}
                            <div className="relative z-30">
                                <button type="button" onClick={() => setLangDropdownOpen(!langDropdownOpen)} aria-haspopup="listbox" aria-expanded={langDropdownOpen}
                                    className="pill-select flex items-center gap-2 !pr-3">
                                    <span className="h-2.5 w-2.5 rounded-full border border-[var(--max-line)]" style={{ background: LANG_COLOR[selectedLang.key] ?? '#8b949e' }} />
                                    {selectedLang.name}
                                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                                </button>
                                <AnimatePresence>
                                    {langDropdownOpen && (
                                        <motion.ul role="listbox" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            className="sticker absolute left-0 top-full z-40 mt-2 max-h-72 min-w-[13rem] overflow-y-auto rounded-[18px] p-1.5 no-scrollbar" style={{ ['--max' as string]: '#f3dc8f' }}>
                                            {languages.map((lang) => (
                                                <li key={lang.key}>
                                                    <button type="button" role="option" aria-selected={selectedLang.key === lang.key} onClick={() => handleLanguageChange(lang)}
                                                        className={`flex w-full items-center gap-2.5 rounded-full px-3 py-1.5 text-left text-xs font-semibold ${selectedLang.key === lang.key ? 'pill-lit text-[#1b1405]' : 'text-campus-navy hover:bg-campus-navy/5'}`}>
                                                        <span className="h-2.5 w-2.5 rounded-full border border-[var(--max-line)]" style={{ background: LANG_COLOR[lang.key] ?? '#8b949e' }} />
                                                        {lang.name}
                                                        {selectedLang.key === lang.key && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
                                                    </button>
                                                </li>
                                            ))}
                                        </motion.ul>
                                    )}
                                </AnimatePresence>
                            </div>
                            <span className="rounded-full border-2 border-[var(--max-line)]/15 px-3 py-1 font-mono text-[11px] text-campus-warm-500">main{LANG_EXT[selectedLang.key] ?? '.txt'}</span>
                            <span className="ml-auto" />
                            <button type="button" onClick={handleCopy} className="btn-glass max-btn h-8 gap-1.5 px-3 text-[11px]">
                                {copied ? <CheckCheck className="h-3.5 w-3.5 text-campus-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? 'Copied' : 'Copy'}
                            </button>
                            <button type="button" onClick={() => { setCode(''); setResult(null); }} className="btn-glass max-btn h-8 gap-1.5 px-3 text-[11px]">
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Clear
                            </button>
                            <button type="button" onClick={handleRun} disabled={isRunning || !code.trim()} className="btn-skeu h-9 gap-1.5 px-5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4 fill-current" aria-hidden />} {isRunning ? 'Running…' : 'Run'}
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] border-2 border-[var(--max-line)]/15">
                            <Editor height="100%" language={selectedLang.monaco} value={code} theme={dark ? 'vs-dark' : 'vs-light'} onChange={(val) => setCode(val || '')}
                                options={{
                                    minimap: { enabled: false }, fontSize: 14, fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontLigatures: true,
                                    padding: { top: 16, bottom: 16 }, scrollBeyondLastLine: false, roundedSelection: true, cursorBlinking: 'smooth',
                                    lineNumbersMinChars: 3, smoothScrolling: true, contextmenu: false, bracketPairColorization: { enabled: true },
                                    guides: { bracketPairs: true }, automaticLayout: true, tabSize: 4,
                                }} />
                        </div>
                    </section>

                    {/* ── input and output ── */}
                    <section className="flex min-h-0 flex-col gap-4">
                        <div className="sticker shrink-0 p-4" style={{ borderRadius: '12px 24px 12px 24px', ['--max' as string]: '#9b8cff' }}>
                            <button type="button" onClick={() => setShowStdin(!showStdin)} aria-expanded={showStdin} className="flex w-full items-center justify-between">
                                <span className="flex items-center gap-2 font-heading text-sm font-bold text-campus-navy"><Keyboard className="h-4 w-4" aria-hidden /> Input <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-campus-warm-500">stdin</span></span>
                                <ChevronDown className={`h-4 w-4 text-campus-warm-500 transition-transform ${showStdin ? 'rotate-180' : ''}`} aria-hidden />
                            </button>
                            <AnimatePresence initial={false}>
                                {showStdin && (
                                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                        <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} spellCheck={false} aria-label="Program input"
                                            placeholder="Input for your program, one value per line…"
                                            className="mt-3 h-24 w-full resize-none rounded-[14px] border-2 border-[rgb(var(--c-navy)/0.15)] bg-[rgb(var(--c-warm-50))] px-3 py-2 font-mono text-xs text-campus-navy placeholder:text-campus-warm-400 focus:border-[var(--max-line)] focus:outline-none" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div className="sticker flex min-h-[260px] flex-1 flex-col p-4 lg:min-h-0" style={{ borderRadius: '24px 12px 24px 12px', ['--max' as string]: '#3fbf8a' }} aria-live="polite">
                            <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
                                <span className="flex items-center gap-2 font-heading text-sm font-bold text-campus-navy"><Terminal className="h-4 w-4" aria-hidden /> Output</span>
                                {result && (
                                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
                                        <span className="max-sticker !inline-flex items-center gap-1 whitespace-nowrap" style={{ background: statusTone }}>
                                            {result.status_id === 3 ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : result.status_id === 6 ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                                            {result.status}
                                        </span>
                                        {result.time && <span className="flex items-center gap-1 font-mono text-[10px] text-campus-warm-500"><Clock className="h-3 w-3" aria-hidden />{result.time}s</span>}
                                        {result.memory && <span className="flex items-center gap-1 font-mono text-[10px] text-campus-warm-500"><Cpu className="h-3 w-3" aria-hidden />{(result.memory / 1024).toFixed(1)} MB</span>}
                                    </span>
                                )}
                            </div>
                            <div className="no-scrollbar min-h-0 flex-1 overflow-auto rounded-[16px] bg-[#1b2a4a] p-4">
                                {isRunning ? (
                                    <p className="flex items-center gap-2 font-mono text-xs text-[#f6ecd2]/80"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Compiling and running…</p>
                                ) : result ? (
                                    <pre className={`whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed ${outputTone}`}>{getOutputContent()}</pre>
                                ) : (
                                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                                        <Terminal className="h-8 w-8 text-[#f6ecd2]/30" aria-hidden />
                                        <p className="text-xs text-[#f6ecd2]/60">Run your code to see its output here.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
