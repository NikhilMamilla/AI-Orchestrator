import { create } from 'zustand';
import {
    createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, GoogleAuthProvider, linkWithCredential, linkWithPopup,
    reauthenticateWithCredential, reauthenticateWithPopup, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
    signInWithPopup, signOut, unlink, updatePassword, updateProfile, type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

interface User {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    providers: string[];          // 'password', 'google.com'
    emailVerified: boolean;
    createdAt: string | null;
    lastSignIn: string | null;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isInitializing: boolean;
    login: (email: string, password: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    register: (email: string, password: string, name: string) => Promise<{ needsEmailConfirmation: boolean }>;
    logout: () => Promise<void>;
    updateName: (name: string) => Promise<void>;
    changePassword: (current: string, next: string) => Promise<void>;
    sendVerification: () => Promise<void>;
    addPassword: (password: string) => Promise<void>;
    linkGoogle: () => Promise<void>;
    unlinkProvider: (providerId: string) => Promise<void>;
    sendPasswordReset: () => Promise<void>;
    deleteAccount: (password?: string) => Promise<void>;
    refreshUser: () => Promise<boolean>;
    applyUser: (user: FirebaseUser | null) => void;
}

const mapUser = (u: FirebaseUser): User => ({
    id: u.uid,
    email: u.email ?? '',
    name: u.displayName || u.email?.split('@')[0] || 'Student',
    avatar: u.photoURL || undefined,
    providers: u.providerData.map((p) => p.providerId),
    emailVerified: u.emailVerified,
    createdAt: u.metadata.creationTime ?? null,
    lastSignIn: u.metadata.lastSignInTime ?? null,
});

// Pages read `error.response.data.detail`; keep that contract while the messages come from Firebase.
const toDetail = (error: unknown): never => {
    const code = (error as { code?: string })?.code ?? '';
    const messages: Record<string, string> = {
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/wrong-password': 'Invalid email or password.',
        'auth/user-not-found': 'Invalid email or password.',
        'auth/invalid-email': 'Invalid email format.',
        'auth/email-already-in-use': 'Email is already registered.',
        'auth/weak-password': 'Password is too weak (minimum 6 characters).',
        'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
        'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
        'auth/popup-blocked': 'The browser blocked the Google window. Allow pop-ups for this site and try again.',
        'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase yet.',
        'auth/unauthorized-domain': 'This site is not an authorised domain in Firebase yet.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
        'auth/requires-recent-login': 'For your security, sign out and back in, then try again.',
        'auth/missing-password': 'Enter your current password.',
        'auth/provider-already-linked': 'That sign-in method is already linked.',
        'auth/credential-already-in-use': 'That Google account already belongs to another Kiddoo account.',
        'auth/no-such-provider': 'That sign-in method is not linked.',
    };
    throw { response: { data: { detail: messages[code] ?? 'Authentication failed. Please try again.' } } };
};

// No persisted copy of the token: Firebase owns the session (storage + refresh).
export const useAuthStore = create<AuthState>()((set) => ({
    user: null,
    isAuthenticated: false,
    isInitializing: true,

    applyUser: (user) =>
        set({
            user: user ? mapUser(user) : null,
            isAuthenticated: !!user,
            isInitializing: false,
        }),

    login: async (email, password) => {
        try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { toDetail(e); }
    },

    loginWithGoogle: async () => {
        try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { toDetail(e); }
    },

    register: async (email, password, name) => {
        try {
            const { user } = await createUserWithEmailAndPassword(auth, email, password);
            if (name) {
                await updateProfile(user, { displayName: name });
                set({ user: mapUser(user) });
            }
        } catch (e) { toDetail(e); }
        return { needsEmailConfirmation: false };
    },

    updateName: async (name) => {
        const u = auth.currentUser;
        if (!u) return;
        try { await updateProfile(u, { displayName: name.trim() }); } catch (e) { toDetail(e); }
        set({ user: mapUser(u) });
    },

    changePassword: async (current, next) => {
        const u = auth.currentUser;
        if (!u?.email) return;
        try {
            await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
            await updatePassword(u, next);
        } catch (e) { toDetail(e); }
    },

    sendVerification: async () => {
        const u = auth.currentUser;
        if (!u) return;
        try { await sendEmailVerification(u); } catch (e) { toDetail(e); }
    },

    // after the learner clicks the link: reload the account, then force a fresh ID token so the server sees email_verified
    refreshUser: async () => {
        const u = auth.currentUser;
        if (!u) return false;
        try { await u.reload(); await u.getIdToken(true); } catch (e) { toDetail(e); }
        set({ user: mapUser(u) });
        return u.emailVerified;
    },

    // a Google account can add a password, so it can also sign in with email + password
    addPassword: async (password) => {
        const u = auth.currentUser;
        if (!u?.email) return;
        try {
            await linkWithCredential(u, EmailAuthProvider.credential(u.email, password));
        } catch (e) {
            if ((e as { code?: string })?.code !== 'auth/requires-recent-login') toDetail(e);
            try {                                                     // Google sessions re-confirm with one popup, then retry
                await reauthenticateWithPopup(u, new GoogleAuthProvider());
                await linkWithCredential(u, EmailAuthProvider.credential(u.email, password));
            } catch (e2) { toDetail(e2); }
        }
        set({ user: mapUser(u) });
    },

    linkGoogle: async () => {
        const u = auth.currentUser;
        if (!u) return;
        try { await linkWithPopup(u, new GoogleAuthProvider()); } catch (e) { toDetail(e); }
        set({ user: mapUser(u) });
    },

    // keeps at least one way to sign in
    unlinkProvider: async (providerId) => {
        const u = auth.currentUser;
        if (!u) return;
        if (u.providerData.length < 2) throw { response: { data: { detail: 'Add another sign-in method first, so you can still sign in.' } } };
        try { await unlink(u, providerId); } catch (e) { toDetail(e); }
        set({ user: mapUser(u) });
    },

    sendPasswordReset: async () => {
        const email = auth.currentUser?.email;
        if (!email) return;
        try { await sendPasswordResetEmail(auth, email); } catch (e) { toDetail(e); }
    },

    // removes the sign-in account itself (call after the learning data is erased on the server)
    deleteAccount: async (password) => {
        const u = auth.currentUser;
        if (!u) return;
        try {
            if (password && u.email && u.providerData.some((p) => p.providerId === 'password')) {
                await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
            } else {
                await reauthenticateWithPopup(u, new GoogleAuthProvider());
            }
            await deleteUser(u);
        } catch (e) { toDetail(e); }
        set({ user: null, isAuthenticated: false });
    },

    logout: async () => {
        await signOut(auth);
        set({ user: null, isAuthenticated: false });
    },
}));
