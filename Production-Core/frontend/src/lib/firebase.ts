import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';

/**
 * Firebase is used for authentication only (email + password, Google). Everything else (data, storage, the
 * knowledge base) is Supabase Postgres, reached through our own API, which verifies the Firebase ID token.
 */
const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

if (!config.apiKey || !config.authDomain || !config.projectId) {
    throw new Error('Missing VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN or VITE_FIREBASE_PROJECT_ID (see frontend/.env.example).');
}

export const firebaseApp = initializeApp(config);
export const auth = getAuth(firebaseApp);
void setPersistence(auth, browserLocalPersistence);

/** The current user's ID token for API calls (Firebase refreshes it before it expires). */
export async function getAccessToken(): Promise<string | null> {
    await auth.authStateReady();
    return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
