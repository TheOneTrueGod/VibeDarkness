import { describe, expect, it } from 'vitest';
import { MUSIC_PLAYER_READOUT_MAX_CHARS } from './musicConstants';
import { formatSongReadout } from './songReadout';

describe('formatSongReadout', () => {
    it('pads short titles to a fixed cassette width', () => {
        const readout = formatSongReadout('The Britons');
        expect(readout).toHaveLength(MUSIC_PLAYER_READOUT_MAX_CHARS);
        expect(readout.startsWith('The Britons')).toBe(true);
        expect(readout.endsWith(' ')).toBe(true);
    });

    it('appends ... when the title is too long', () => {
        const readout = formatSongReadout('A Very Brady Special');
        expect(readout).toHaveLength(MUSIC_PLAYER_READOUT_MAX_CHARS);
        expect(readout.endsWith('...')).toBe(true);
        expect(readout.includes('A Very Brady')).toBe(true);
    });
});
