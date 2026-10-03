/**
 * A word whose first letter is a calligraphic capital, the rest in the display serif: the type of the landing story,
 * shared by the story's overlays and the landing page. Both parts sit on one baseline (the capital rises above the
 * word and tucks under its first letters), and that is the baseline of the whole box, so words set beside it in the
 * same line line up with the word, not with the capital's swash. `deep` is the dark teal ink for light scenes; the
 * default is gold. `tuck` is how far the word tucks back under the capital, in em of `size`.
 */
export function Script({ first, rest, size, className = '', deep = false, tuck = 0.86 }: { first: string; rest: string; size: string; className?: string; deep?: boolean; tuck?: number }) {
    return (
        <span className={`inline-flex items-baseline whitespace-nowrap leading-none ${className}`}>
            {/* the ink classes pad the capital (so its swash is never clipped); the word tucks back into it, and the negative
                margin gives back the padding under it, so the next line follows at the normal distance */}
            <span className={`${deep ? 'ink-deep' : 'believed-ink'} inline-block font-script leading-none`} style={{ fontSize: `calc(${size} * 1.5)`, marginBottom: '-0.3em' }}>{first}</span>
            <span className={`${deep ? 'ink-deep-flat' : 'story-ink'} font-display font-semibold leading-none`} style={{ fontSize: size, marginLeft: `calc(${size} * -${tuck})` }}>{rest}</span>
        </span>
    );
}
