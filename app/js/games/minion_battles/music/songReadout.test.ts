import { describe, expect, it } from 'vitest';
import { MUSIC_PLAYER_READOUT_MAX_CHARS } from './musicConstants';
import { formatSongReadout } from './songReadout';

describe('formatSongReadout', () => {
    it('leaves short titles unchanged so they can fill the cassette box', () => {
        expect(formatSongReadout('The Britons')).toBe('The Britons');
        expect(formatSongReadout('The Britons').length).toBeLessThanOrEqual(MUSIC_PLAYER_READOUT_MAX_CHARS);
    });

    it('appends ... when the title is too long', () => {
        const readout = formatSongReadout('A Very Brady Special Extra Long Title');
        expect(readout).toHaveLength(MUSIC_PLAYER_READOUT_MAX_CHARS);
        expect(readout.endsWith('...')).toBe(true);
    });
});
