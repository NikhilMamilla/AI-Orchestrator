import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '../lib/firebase';

interface WebSocketMessage {
    type: string;
    [key: string]: unknown;
}

interface UseWebSocketOptions {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
    onMessage?: (message: WebSocketMessage) => void;
    autoConnect?: boolean;
}

export function useWebSocket(sessionId: string | null, options: UseWebSocketOptions = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const optionsRef = useRef(options);
    const MAX_RECONNECT_ATTEMPTS = 5;

    // Keep options ref updated
    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/ws';

    const connect = useCallback(() => {
        if (!sessionId) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        // Clean up existing connection if any
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onmessage = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
        }

        const ws = new WebSocket(`${WS_URL}/session/${sessionId}`);

        ws.onopen = async () => {
            // First frame authenticates the socket (the server closes with 4401 otherwise).
            const token = await getAccessToken();
            if (!token) {
                ws.close(4401, 'not signed in');
                return;
            }
            ws.send(JSON.stringify({ type: 'auth', token }));
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            optionsRef.current.onOpen?.();
        };

        ws.onclose = () => {
            setIsConnected(false);
            wsRef.current = null;
            optionsRef.current.onClose?.();

            // Attempt to reconnect with exponential backoff
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
                reconnectTimeoutRef.current = setTimeout(() => {
                    reconnectAttemptsRef.current += 1;
                    connect();
                }, timeout);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            optionsRef.current.onError?.(error);
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                setLastMessage(message);

                // Handle streaming messages
                if (message.type === 'stream_start') {
                    setStreamingText('');
                    setIsStreaming(true);
                } else if (message.type === 'stream_chunk') {
                    setStreamingText((prev) => prev + (message.chunk || ''));
                }

                // Notify parent
                optionsRef.current.onMessage?.(message);

                // End stream AFTER parent is notified to prevent UI flicker
                if (message.type === 'stream_end') {
                    setIsStreaming(false);
                }
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        wsRef.current = ws;
    }, [sessionId, WS_URL]); // Removed 'options' from dependencies

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onmessage = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsConnected(false);
    }, []);

    const sendMessage = useCallback((type: string, payload: Record<string, unknown> = {}) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type, payload }));
        } else {
            console.warn('WebSocket is not connected. Message not sent:', type);
        }
    }, []);

    useEffect(() => {
        const shouldConnect = options.autoConnect ?? true;
        if (shouldConnect && sessionId) {
            connect();
        }
        return () => {
            disconnect();
        };
    }, [sessionId, connect, disconnect, options.autoConnect]);

    return {
        isConnected,
        lastMessage,
        streamingText,
        isStreaming,
        sendMessage,
        connect,
        disconnect,
    };
}
