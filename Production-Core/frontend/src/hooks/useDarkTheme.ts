import { useEffect, useState } from 'react';

/** The site theme (data-theme on <html>), live: code editors follow the toggle. */
export function useDarkTheme() {
    const read = () => document.documentElement.dataset.theme === 'dark';
    const [dark, setDark] = useState(read);
    useEffect(() => {
        const mo = new MutationObserver(() => setDark(read()));
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => mo.disconnect();
    }, []);
    return dark;
}
