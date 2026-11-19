import { describe, expect, it } from 'vitest';
import { REWIND_OVERLAY_FADE_MS, REWIND_OVERLAY_QUICK_FADE_MS, rewindFadeMsForReason } from './rewindFade';

describe('rewindFadeMsForReason', () => {
    it('uses the quick fade for swap rewinds', () => {
        expect(rewindFadeMsForReason('swap')).toBe(REWIND_OVERLAY_QUICK_FADE_MS);
        expect(REWIND_OVERLAY_QUICK_FADE_MS).toBeLessThan(REWIND_OVERLAY_FADE_MS);
    });

    it('uses the standard fade for other reasons', () => {
        expect(rewindFadeMsForReason('rollback')).toBe(REWIND_OVERLAY_FADE_MS);
        expect(rewindFadeMsForReason('turn_committed')).toBe(REWIND_OVERLAY_FADE_MS);
    });
});
