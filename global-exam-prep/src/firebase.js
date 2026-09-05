/**
 * ⚠️ IDENTITY NOTE (Supabase migration, Phase 2): student *authentication* now
 * goes through Supabase (src/supabase.js), so `firebase/auth` is no longer
 * initialised from the auth flow and Firestore `request.auth` is EMPTY for a
 * signed-in student. Everything still served from here — exam history
 * (`users/{uid}/examHistory`), syllabus storage, feedback, storage uploads —
 * keeps working only until the identity bridge lands: the rules in
 * firestore.rules gate those paths on `request.auth.uid == uid`, and a Supabase
 * session is deliberately not presented as a Firebase credential. See
 * AUTH.md / the Phase-2 report for the affected paths.
 */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ---------------------------------------------------------------------------
// Firebase configuration — supplied by VITE_FIREBASE_* environment variables.
// Nothing secret lives here: these values are safe to expose to the browser
// (that is how Firebase works); the thing that must stay private is the
// Firestore security rules and the server-only GMAIL_* credentials used by
// /api/send-otp.
//
// To find your values: Firebase console -> Project settings -> General ->
// "Your apps" -> SDK setup and configuration -> Web app -> Config.
// ---------------------------------------------------------------------------
const rawConfig = {
    apiKey:             import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:          import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:              import.meta.env.VITE_FIREBASE_APP_ID,
};

const PLACEHOLDER = /AIzaSyDummyKeyForDevelopmentPurposes|your-app|1234567890:web|abcdef123456/i;

const missingKeys = Object.entries(rawConfig)
    .filter(([, value]) => !value || PLACEHOLDER.test(String(value)))
    .map(([key]) => key);

/**
 * Non-null when the app has no usable Firebase project. AuthContext reads this
 * so the UI can explain the problem instead of hanging on a loading spinner.
 */
export const firebaseConfigError = missingKeys.length
    ? 'Firebase is not configured for this deployment. Set the VITE_FIREBASE_* '
      + 'environment variables (see .env.example) and redeploy. Missing: '
      + missingKeys.join(', ')
    : null;

// Fall back to inert placeholders so `initializeApp` cannot crash the whole
// bundle at import time while a preview build is misconfigured. Importing this
// module should always succeed; auth should fail loudly, not silently.
const firebaseConfig = Object.fromEntries(
    Object.entries(rawConfig).map(([key, value]) => [
        key,
        value && !PLACEHOLDER.test(String(value)) ? value : 'invalid-config',
    ])
);

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

export { app };
