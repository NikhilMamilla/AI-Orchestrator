
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ChatInterface, { type Message } from '../components/session/ChatInterface';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuthStore } from '../store/authStore';
import {
    ChevronLeft,
    Clock,
    GraduationCap,
} from 'lucide-react';

export default function LearningSessionPage() {
    const { id: sessionId } = useParams<{ id: string }>();
    const { user } = useAuthStore();
    const navigate = useNavigate();

    const [messages, setMessages] = useState<Message[]>([]);
    const [localActivity, setLocalActivity] = useState<{ concept_id?: string } | null>(null);

    // ── Live Session Timer ──
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        timerRef.current = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const formatTime = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const addMessage = (role: 'user' | 'assistant' | 'system', content: string) => {
        setMessages(prev => [...prev, {
            role,
            content,
            timestamp: new Date()
        }]);
    };

    const handleWebSocketMessage = useCallback((message: { type: string; current_activity?: { concept_id?: string }; full_text?: string; message?: string }) => {
        switch (message.type) {
            case 'session_started':
                addMessage('system', 'Session started. Ask anything about DSA!');
                setLocalActivity(message.current_activity ?? null);
                break;

            case 'chat_reply':
                break;

            case 'stream_end':
                if (message.full_text) {
                    addMessage('assistant', message.full_text);
                }
                break;

            case 'error':
                addMessage('system', `Connection issue: ${message.message}`);
                break;
        }
    }, [sessionId]); // Only recreate if sessionId changes

    const { isConnected, sendMessage, isStreaming, streamingText } = useWebSocket(
        sessionId || '',
        { onMessage: handleWebSocketMessage }
    );

    const handleStopGeneration = useCallback(() => {
        sendMessage('stop_generation');
    }, [sendMessage]);

    useEffect(() => {
        if (isConnected && user?.id) {
            sendMessage('start_session', {
                student_id: user.id
            });
        }
    }, [isConnected, user?.id]);

    const handleSendMessage = (text: string) => {
        addMessage('user', text);
        sendMessage('student_response', {
            response_type: 'chat',
            answer: text
        });
    };

    const handleEndSession = () => {
        if (window.confirm("Ready to wrap up this session?")) {
            navigate('/dashboard');
        }
    };

    if (!sessionId) return <div>Invalid Session</div>;

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />

            <main className="flex-1 flex flex-col min-w-0 relative pt-16 lg:pt-0">
                {/* Warm Header */}
                <header className="h-auto min-h-[68px] px-4 md:px-8 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-campus-ivory border-b border-campus-warm-100 z-20 shrink-0 gap-4">
                    <div className="flex items-center gap-3 md:gap-5 w-full sm:w-auto">
                        <button
                            onClick={handleEndSession}
                            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center hover:bg-campus-warm-100 rounded-campus-sm text-campus-warm-400 transition-all active:scale-95"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="h-7 w-px bg-campus-warm-200 hidden xs:block" />
                        <div className="min-w-0">
                            <h1 className="text-base md:text-lg font-heading font-semibold text-campus-navy leading-tight truncate">
                                {localActivity?.concept_id?.replace(/_/g, ' ') || 'Learning Session'}
                            </h1>
                            <div className="flex items-center gap-3 mt-0.5">
                                {isConnected ? (
                                    <span className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-accent font-semibold text-campus-success uppercase tracking-wider">
                                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-campus-success animate-pulse" />
                                        Live
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-accent font-semibold text-campus-rose uppercase tracking-wider">
                                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-campus-rose" />
                                        Reconnecting
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="flex items-center gap-2">
                            {/* Level Badge */}
                            <div className="flex items-center gap-1.5 md:gap-2 bg-campus-gold/10 px-2.5 md:px-3.5 py-1.5 md:py-2 rounded-campus-sm border border-campus-gold/20">
                                <GraduationCap className="w-3.5 h-3.5 md:w-4 md:h-4 text-campus-gold" />
                                <span className="text-[10px] md:text-xs font-accent font-bold text-campus-gold">
                                    Lvl {Math.max(1, Math.floor(messages.filter(m => m.role === 'user').length / 5) + 1)}
                                </span>
                            </div>
                            {/* Timer */}
                            <div className="flex items-center gap-1.5 md:gap-2 bg-campus-primary/5 px-2.5 md:px-3.5 py-1.5 md:py-2 rounded-campus-sm border border-campus-navy/10">
                                <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-campus-navy" />
                                <span className="text-[10px] md:text-xs font-accent font-bold text-campus-navy tabular-nums campus-stat">
                                    {formatTime(elapsedSeconds)}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={handleEndSession}
                            className="campus-btn-secondary py-1.5 md:py-2 px-4 md:px-5 text-xs md:text-sm"
                        >
                            End
                        </button>
                    </div>
                </header>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 max-w-4xl w-full mx-auto flex flex-col bg-campus-ivory/50 border-x border-campus-warm-100/50 min-h-0">
                        <ChatInterface
                            messages={messages}
                            onSendMessage={handleSendMessage}
                            onStopGeneration={handleStopGeneration}
                            isStreaming={isStreaming}
                            streamingText={streamingText}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
