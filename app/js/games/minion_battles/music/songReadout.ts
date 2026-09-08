import { MUSIC_PLAYER_READOUT_MAX_CHARS } from './musicConstants';

const ELLIPSIS = '...';

/** Fixed-width cassette-style title; over-long names end with '...'. */
export function formatSongReadout(
    title: string,
    maxChars: number = MUSIC_PLAYER_READOUT_MAX_CHARS,
): string {
    if (maxChars <= 0) return '';
    if (title.length <= maxChars) {
        return title;
    }
    if (maxChars <= ELLIPSIS.length) {
        return ELLIPSIS.slice(0, maxChars);
    }
    return `${title.slice(0, maxChars - ELLIPSIS.length)}${ELLIPSIS}`;
}
