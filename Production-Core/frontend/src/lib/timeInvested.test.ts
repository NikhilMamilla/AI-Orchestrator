import { describe, expect, it } from 'vitest';
import { formatInvested } from './timeInvested';

describe('time invested', () => {
    it('shows minutes below an hour and hours with one decimal above it', () => {
        expect(formatInvested(12)).toEqual({ value: '12', unit: 'min' });
        expect(formatInvested(95)).toEqual({ value: '1.6', unit: 'hours' });
        expect(formatInvested(600)).toEqual({ value: '10', unit: 'hours' });
    });
    it('shows a dash, not a fake zero, when nothing has been timed', () => {
        expect(formatInvested(0)).toEqual({ value: '–', unit: '' });
        expect(formatInvested(undefined)).toEqual({ value: '–', unit: '' });
    });
});
