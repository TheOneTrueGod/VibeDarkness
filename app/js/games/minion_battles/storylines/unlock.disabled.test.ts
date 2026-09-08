import { describe, expect, it } from 'vitest';
import { canPlayerSelectMission, isMissionDisabled } from './unlock';
import { MISSION_MAP_DISABLED } from './types';

describe('isMissionDisabled', () => {
    it('is true only when the def sets disabled', () => {
        expect(isMissionDisabled(undefined)).toBe(false);
        expect(isMissionDisabled({})).toBe(false);
        expect(isMissionDisabled({ disabled: false })).toBe(false);
        expect(isMissionDisabled({ disabled: MISSION_MAP_DISABLED })).toBe(true);
    });
});

describe('canPlayerSelectMission', () => {
    it('lets admins select locked or disabled missions', () => {
        expect(canPlayerSelectMission({ isAdmin: true, isUnlocked: false, isDisabled: true })).toBe(true);
        expect(canPlayerSelectMission({ isAdmin: true, isUnlocked: true, isDisabled: true })).toBe(true);
        expect(canPlayerSelectMission({ isAdmin: true, isUnlocked: false, isDisabled: false })).toBe(true);
    });

    it('blocks non-admins from locked or disabled missions', () => {
        expect(canPlayerSelectMission({ isAdmin: false, isUnlocked: true, isDisabled: true })).toBe(false);
        expect(canPlayerSelectMission({ isAdmin: false, isUnlocked: false, isDisabled: false })).toBe(false);
        expect(canPlayerSelectMission({ isAdmin: false, isUnlocked: true, isDisabled: false })).toBe(true);
    });
});
