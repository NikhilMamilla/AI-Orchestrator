
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, GraduationCap, User, Sparkles, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkLooseStrong from '../../lib/remarkLooseStrong';

export interface Message {
    role: 'user' | 'assistant' | 'system' | string;
    content: string;
    timestamp: Date;
}

interface ChatInterfaceProps {
    messages: Message[];
    onSendMessage: (message: string) => void;
    onStopGeneration?: () => void;
    isStreaming?: boolean;
    streamingText?: string;
}

export default function ChatInterface({
    messages,
    onSendMessage,
    onStopGeneration,
    isStreaming,
    streamingText
}: ChatInterfaceProps) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scrollToBottom = () => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        };

        // Initial scroll
        scrollToBottom();

        // Small delay to account for markdown rendering and images
        const timeoutId = setTimeout(scrollToBottom, 50);
        return () => clearTimeout(timeoutId);
    }, [messages, isStreaming, streamingText]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isStreaming) {
            onSendMessage(input);
            setInput('');
        }
    };

    return (
        <div className="flex flex-col h-full relative">
            {/* Chat Header */}
            <div className="px-8 py-5 bg-campus-ivory border-b border-campus-warm-100 flex items-center gap-4 shrink-0 z-10">
                <div className="w-11 h-11 bg-campus-primary rounded-campus-sm flex items-center justify-center shadow-campus-navy">
                    <GraduationCap className="text-campus-gold w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-base font-heading font-semibold text-campus-navy">AI Orchestrator</h3>
                    <p className="text-[10px] font-accent font-medium text-campus-warm-300 uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-campus-success" />
                        {isStreaming ? 'Thinking...' : 'Ready to learn'}
                    </p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                <AnimatePresence initial={false}>
                    {messages.map((message, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className={`flex ${message.role === 'user' ? 'justify-end' :
                                message.role === 'system' ? 'justify-center' : 'justify-start'}`}
                        >
                            <div className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                {/* Avatar */}
                                {message.role !== 'system' && (
                                    <div className={`w-9 h-9 rounded-campus-sm shrink-0 flex items-center justify-center
                                        ${message.role === 'user'
                                            ? 'bg-campus-primary text-white'
                                            : 'bg-campus-gold/15 text-campus-gold border border-campus-gold/20'}`}>
                                        {message.role === 'user'
                                            ? <User className="w-4 h-4" />
                                            : <GraduationCap className="w-4 h-4" />}
                                    </div>
                                )}

                                {/* Bubble */}
                                <div className={`group flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-5 py-4 relative transition-all duration-200
                                        ${message.role === 'user'
                                            ? 'bg-campus-primary text-white rounded-campus rounded-tr-sm shadow-campus-navy'
                                            : message.role === 'system'
                                                ? 'bg-campus-warm-100/50 text-campus-warm-400 rounded-full text-[10px] font-accent font-semibold uppercase tracking-wider px-6 py-2'
                                                : 'bg-campus-ivory border border-campus-warm-100 text-campus-ink rounded-campus rounded-tl-sm hover:shadow-campus-md hover:border-campus-gold/20'}`}>

                                        <div className={`markdown-content prose prose-sm max-w-none
                                            ${message.role === 'user' ? 'prose-invert' : 'prose-campus'}`}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkLooseStrong]}>
                                                {message.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>

                                    {message.role !== 'system' && (
                                        <span className="text-[10px] font-accent text-campus-warm-300 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {/* Streaming Indicator */}
                    {isStreaming && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start"
                        >
                            <div className="flex gap-3 items-start max-w-[80%]">
                                <div className="w-9 h-9 rounded-campus-sm bg-campus-gold/15 text-campus-gold flex items-center justify-center shrink-0 border border-campus-gold/20">
                                    <Sparkles className="w-4 h-4 animate-pulse" />
                                </div>
                                <div className="px-5 py-4 bg-campus-warm-50 border border-campus-warm-100/50 rounded-campus rounded-tl-sm">
                                    {streamingText ? (
                                        <div className="prose prose-sm prose-campus max-w-none">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkLooseStrong]}>
                                                {streamingText}
                                            </ReactMarkdown>
                                            <span className="inline-block w-1.5 h-4 bg-campus-gold/40 ml-1 rounded-sm animate-pulse align-middle" />
                                        </div>
                                    ) : (
                                        <div className="flex gap-1.5 py-1">
                                            <span className="w-2 h-2 rounded-full bg-campus-gold/50 animate-bounce [animation-delay:0ms]" />
                                            <span className="w-2 h-2 rounded-full bg-campus-gold/50 animate-bounce [animation-delay:150ms]" />
                                            <span className="w-2 h-2 rounded-full bg-campus-gold/50 animate-bounce [animation-delay:300ms]" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Bar */}
            <div className="px-8 pb-8 pt-4 bg-campus-surface border-t border-campus-warm-100">
                <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto flex items-center gap-3">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isStreaming ? "AI is generating..." : "Ask your AI tutor..."}
                        className="flex-1 bg-campus-ivory border border-campus-warm-100 rounded-campus-sm px-6 py-4 text-sm font-accent focus:outline-none focus:ring-2 focus:ring-campus-gold/20 transition-all placeholder:text-campus-warm-300"
                    />
                    <button
                        type="submit"
                        onClick={(e) => {
                            if (isStreaming && onStopGeneration) {
                                e.preventDefault();
                                onStopGeneration();
                            }
                        }}
                        className={`w-14 h-14 rounded-campus-sm flex items-center justify-center transition-all shadow-campus-navy shrink-0
                            ${isStreaming
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-campus-primary hover:bg-campus-primary/90 text-white'}`}
                    >
                        {isStreaming ? (
                            <Square className="w-5 h-5 fill-current" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
