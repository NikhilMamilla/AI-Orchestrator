/** Browser-native speech (free, on-device where the browser allows). Feature-detected: absent APIs hide the controls. */

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

interface RecognitionResultLike {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface RecognitionLike {
    lang: string;
    interimResults: boolean;
    onresult: ((e: RecognitionResultLike) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    start: () => void;
    stop: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

const Recognition: RecognitionCtor | undefined =
    typeof window === 'undefined'
        ? undefined
        : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
            (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

export const canListen = Recognition !== undefined;

/** Plain text for speech: citation markers, code fences and markdown symbols removed. */
export function speakable(markdown: string): string {
    return markdown
        .replace(/```[\s\S]*?```/g, ' (code omitted) ')
        .replace(/\[(\d+)\]/g, '')
        .replace(/[*_`#>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function speak(text: string, onEnd: () => void): void {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.rate = 0.95;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
    if (canSpeak) window.speechSynthesis.cancel();
}

/** One-shot dictation. Returns a stop function. */
export function listen(onText: (t: string) => void, onEnd: () => void): () => void {
    if (!Recognition) {
        onEnd();
        return () => undefined;
    }
    const r = new Recognition();
    r.lang = navigator.language || 'en-US';
    r.interimResults = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onend = onEnd;
    r.onerror = onEnd;
    r.start();
    return () => r.stop();
}
