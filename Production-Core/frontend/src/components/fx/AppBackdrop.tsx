import Motes from './Motes';

/**
 * The app's background, in the landing story's language: the sky of "Every learner" (night sky in the dark theme), its
 * light rays and the same rising light motes as the top of the landing page. Fixed behind the page, so sticky navigation keeps working. Purely decorative.
 */
export default function AppBackdrop({ motes = 24 }: { motes?: number }) {
    return (
        <div aria-hidden className="world-sky pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="world-layer sky-rays" />
            <div className="world-layer"><Motes count={motes} /></div>
        </div>
    );
}
