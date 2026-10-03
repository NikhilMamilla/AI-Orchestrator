
import { useState, useEffect } from 'react';
import { errorMessage } from '../lib/errors';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, MailCheck, Lock, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { AuthShell, AuthField, GoogleButton } from '../components/auth/AuthShell';
import GoogleLogo from '../components/auth/GoogleLogo';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { API } from '../lib/rag';

const LoginPage = () => {
    useEffect(() => { void import('./DashboardPage'); }, []);   // fetched while you type: signing in shows it at once
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'login' | 'forgot'>('login');

    const login = useAuthStore((state) => state.login);
    const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
    const navigate = useNavigate();
    const from = (useLocation().state as { from?: string } | null)?.from;
    const next = from && from.startsWith('/') && !from.startsWith('//') ? from : '/home';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
            navigate(next, { replace: true });
        } catch (err) {
            setError(errorMessage(err, 'Login failed. Please check your credentials.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setIsLoading(true);
        try {
            await loginWithGoogle();
            navigate(next, { replace: true });
        } catch (err) {
            setError(errorMessage(err, 'Google sign-in failed.'));
        } finally {
            setIsLoading(false);
        }
    };

    if (mode === 'forgot') return <ForgotPassword initialEmail={email} onBack={() => setMode('login')} />;

    return (
        <AuthShell title="Welcome" mark="back." subtitle="Pick up exactly where your answers left you." error={error}
            footer={<>New to Kiddoo? <Link to="/register" className="font-bold text-campus-navy underline decoration-2 underline-offset-4 hover:text-campus-gold">Create an account</Link></>}>
            <form onSubmit={handleSubmit} className="space-y-3">
                <AuthField icon={Mail} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
                <AuthField icon={Lock} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                <div className="flex justify-end">
                    <button type="button" onClick={() => { setError(''); setMode('forgot'); }} className="text-xs font-semibold text-campus-navy underline decoration-2 underline-offset-4 hover:text-campus-gold">Forgot password?</button>
                </div>
                <button type="submit" disabled={isLoading} className="btn-skeu !mt-5 h-12 w-full text-base disabled:cursor-not-allowed disabled:opacity-60">
                    {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" />Signing in…</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
                </button>
            </form>
            <GoogleButton onClick={handleGoogleLogin} disabled={isLoading} />
        </AuthShell>
    );
};

export default LoginPage;


type ResetState =
    | { kind: 'idle' } | { kind: 'busy' } | { kind: 'sent'; email: string } | { kind: 'no-account' } | { kind: 'google-only' } | { kind: 'error'; text: string };

/**
 * Forgot password: only for an email that already has a Kiddoo account. Our server keeps a keyed hash of each signed-in
 * email (Firebase never says whether an email exists), so it can answer: no account -> sign up first; Google-only ->
 * use Google; otherwise Firebase emails a reset link, and its page sets the new password.
 */
function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
    const [email, setEmail] = useState(initialEmail);
    const [state, setState] = useState<ResetState>({ kind: 'idle' });
    const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setState({ kind: 'busy' });
        try {
            const res = await fetch(`${API}/auth/account-check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
            if (res.status === 429) return setState({ kind: 'error', text: 'Too many tries. Wait a minute and try again.' });
            if (res.status === 422) return setState({ kind: 'error', text: 'Enter a valid email address.' });
            const r: { exists: boolean | null; password: boolean | null; google?: boolean } = await res.json();
            if (r.exists === false) return setState({ kind: 'no-account' });
            if (r.exists && !r.password && r.google) return setState({ kind: 'google-only' });
            await sendPasswordResetEmail(auth, email.trim());
            setState({ kind: 'sent', email: email.trim() });
        } catch (err) {
            const code = (err as { code?: string })?.code;
            setState({ kind: 'error', text: code === 'auth/too-many-requests' ? 'Too many requests. Try again in a few minutes.' : 'Could not send the reset link right now. Try again.' });
        }
    };

    return (
        <AuthShell title="Forgot your" mark="password?" subtitle="We'll email you a link to choose a new one."
            error={state.kind === 'error' ? state.text : ''}
            footer={<button type="button" onClick={onBack} className="font-bold text-campus-navy underline decoration-2 underline-offset-4 hover:text-campus-gold">Back to sign in</button>}>
            {state.kind === 'sent' ? (
                <div className="space-y-3 text-center" role="status">
                    <MailCheck className="mx-auto h-10 w-10 text-campus-success" aria-hidden />
                    <p className="text-sm text-campus-navy">We sent a reset link to <b className="break-all">{state.email}</b>.</p>
                    <p className="text-xs leading-relaxed text-campus-warm-500">Open it, choose a new password, then come back and sign in. Check spam if it isn't there in a minute.</p>
                    <button type="button" onClick={onBack} className="btn-skeu h-11 w-full text-sm">Back to sign in</button>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-3">
                    <AuthField icon={Mail} type="email" required autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); if (state.kind !== 'busy') setState({ kind: 'idle' }); }} placeholder="Email address" />
                    {state.kind === 'no-account' && (
                        <div className="rounded-[16px] border-2 border-dashed border-campus-rose/50 p-3 text-xs leading-relaxed text-campus-warm-500" role="alert">
                            <b className="block text-campus-rose">No Kiddoo account uses this email.</b>
                            Sign up first; it takes a minute. <Link to="/register" className="font-bold text-campus-navy underline underline-offset-4">Create an account</Link>
                        </div>
                    )}
                    {state.kind === 'google-only' && (
                        <div className="rounded-[16px] border-2 border-dashed border-[var(--max-line)] p-3 text-xs leading-relaxed text-campus-warm-500" role="alert">
                            <b className="block text-campus-navy">This account signs in with Google.</b>
                            It has no password to reset. Use Google instead; you can add a password later in Settings.
                            <button type="button" onClick={() => void loginWithGoogle()} className="btn-glass max-btn mt-2 flex h-9 w-full gap-2 text-xs"><GoogleLogo className="h-4 w-4" /> Continue with Google</button>
                        </div>
                    )}
                    <button type="submit" disabled={state.kind === 'busy' || !email.trim()} className="btn-skeu !mt-4 h-12 w-full text-base disabled:cursor-not-allowed disabled:opacity-60">
                        {state.kind === 'busy' ? <><Loader2 className="h-5 w-5 animate-spin" />Checking…</> : <>Send reset link <ArrowRight className="h-4 w-4" /></>}
                    </button>
                </form>
            )}
        </AuthShell>
    );
}
