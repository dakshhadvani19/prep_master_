/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'prep-master-theme';

function readInitialTheme() {
    let theme = 'light';
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') theme = saved;
    } catch {
        // The default light appearance still works when storage is unavailable.
    }

    if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
    }
    return theme;
}

function nextPaint() {
    return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(readInitialTheme);
    const [showLoader, setShowLoader] = useState(false);
    const switchingRef = useRef(false);

    const toggleTheme = useCallback(async () => {
        if (switchingRef.current) return;
        switchingRef.current = true;

        const startedAt = window.performance.now();
        const nextTheme = theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.style.colorScheme = nextTheme;
        setTheme(nextTheme);

        try {
            window.localStorage.setItem(STORAGE_KEY, nextTheme);
        } catch {
            // Theme switching still works for this session.
        }

        let loaderShown = false;
        const loaderTimer = window.setTimeout(() => {
            loaderShown = true;
            setShowLoader(true);
        }, 500);

        try {
            await nextPaint();
            await nextPaint();
            if (window.performance.now() - startedAt >= 500) {
                window.clearTimeout(loaderTimer);
                if (!loaderShown) {
                    loaderShown = true;
                    setShowLoader(true);
                }
                await nextPaint();
            }
        } finally {
            window.clearTimeout(loaderTimer);
            if (loaderShown) setShowLoader(false);
            switchingRef.current = false;
        }
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
            {showLoader && (
                <div className="pm-theme-switch-loader" role="status" aria-live="polite">
                    <span className="pm-theme-switch-loader__spinner" aria-hidden="true" />
                    <span>Changing appearance…</span>
                </div>
            )}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
    return context;
}
