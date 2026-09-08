import { describe, expect, it } from 'vitest';
import {
    PORTRAITS,
    getPortraitIds,
    getPortraitIdsForPlayer,
    isPortraitAllowedForPlayer,
    pickRandomPortraitIdForPlayer,
} from './portraitLoader';

function restrictedPortraitIds(): string[] {
    return getPortraitIds().filter((id) => PORTRAITS[id]?.allowedPlayerIds != null);
}

describe('portrait eligibility', () => {
    const restricted = restrictedPortraitIds();
    const outsiderId = 9_999_999;

    it('lets any player use unrestricted portraits', () => {
        for (const id of getPortraitIds()) {
            if (PORTRAITS[id]?.allowedPlayerIds) continue;
            expect(isPortraitAllowedForPlayer(id, outsiderId)).toBe(true);
        }
    });

    it('hides restricted portraits from players who are not on the allowlist', () => {
        expect(restricted.length).toBeGreaterThan(0);
        const allowed = getPortraitIdsForPlayer(outsiderId);
        for (const id of restricted) {
            expect(allowed).not.toContain(id);
        }
    });

    it('includes restricted portraits for an allowlisted player', () => {
        const restrictedId = restricted[0];
        const allowList = PORTRAITS[restrictedId]?.allowedPlayerIds ?? [];
        expect(allowList.length).toBeGreaterThan(0);
        expect(getPortraitIdsForPlayer(allowList[0])).toContain(restrictedId);
    });

    it('picks a random portrait from the player-eligible set', () => {
        const eligible = getPortraitIdsForPlayer(outsiderId);
        expect(eligible.length).toBeGreaterThan(0);
        for (let i = 0; i < 20; i++) {
            const picked = pickRandomPortraitIdForPlayer(outsiderId);
            expect(picked).toBeDefined();
            expect(eligible).toContain(picked);
        }
    });
});
