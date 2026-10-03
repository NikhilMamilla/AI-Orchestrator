
import { useState, useEffect } from 'react';
import { errorMessage } from '../lib/errors';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { AuthShell, AuthField, GoogleButton } from '../components/auth/AuthShell';

const RegisterPage = () => {
    useEffect(() => { void import('./DashboardPage'); }, []);   // fetched while you type: signing in shows it at once
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const register = useAuthStore((state) => state.register);
    const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setIsLoading(true);

        try {
            await register(email, password, name);
            navigate('/home');
        } catch (err) {
            setError(errorMessage(err, 'Registration failed. Please try again.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setIsLoading(true);
        try {
            await loginWithGoogle();
            navigate('/home');
        } catch (err) {
            setError(errorMessage(err, 'Google sign-in failed.'));
        } finally {
            setIsLoading(false);
        }
    };

    const narrow = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px)').matches;

    return (
        <AuthShell title="Start" mark="learning." subtitle="Free. Your learner model starts empty & learns only from you." error={error}
            footer={<>Already have an account? <Link to="/login" className="font-bold text-campus-navy underline decoration-2 underline-offset-4 hover:text-campus-gold">Sign in</Link></>}>
            <form onSubmit={handleSubmit} className="space-y-3">
                <AuthField icon={User} type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
                <AuthField icon={Mail} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
                <div className="space-y-3">
                    <AuthField icon={Lock} type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={narrow ? 'Password (min. 8 characters)' : 'Create a password (at least 8 characters)'} />
                    <AuthField icon={Lock} type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" />
                </div>
                <button type="submit" disabled={isLoading} className="btn-skeu !mt-5 h-12 w-full text-base disabled:cursor-not-allowed disabled:opacity-60">
                    {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" />Creating account…</> : <>Create account <ArrowRight className="h-4 w-4" /></>}
                </button>
            </form>
            <GoogleButton onClick={handleGoogleLogin} disabled={isLoading} />
        </AuthShell>
    );
};

export default RegisterPage;
