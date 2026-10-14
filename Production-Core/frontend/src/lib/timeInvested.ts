/** "Time invested" as a value and a unit. The figure is an estimate; with nothing timed yet it shows a dash, never a made-up zero. */
export function formatInvested(minutes: number | undefined): { value: string; unit: string } {
    if (!minutes || minutes <= 0) return { value: '–', unit: '' };
    if (minutes < 60) return { value: String(Math.round(minutes)), unit: 'min' };
    const hours = minutes / 60;
    return { value: hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1), unit: 'hours' };
}
