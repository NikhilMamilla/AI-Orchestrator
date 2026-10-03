/** Whether the opening sequence has played in this page load. A module flag survives route changes and StrictMode remounts. */
export const introFlag = { played: false };
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const introWillPlay = () => !introFlag.played && !prefersReducedMotion();
