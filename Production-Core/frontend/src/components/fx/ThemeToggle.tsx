import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';

/** Light/dark switch with a rotating icon morph. Defaults to the system preference; the choice is remembered. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
    const [theme, toggle] = useTheme();
    const dark = theme === 'dark';
    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={dark}
            className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full neo-raised text-campus-navy transition-transform hover:scale-105 active:scale-95 ${className}`}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={theme}
                    initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.22 }}
                    className="flex"
                >
                    {dark ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
                </motion.span>
            </AnimatePresence>
        </button>
    );
}
