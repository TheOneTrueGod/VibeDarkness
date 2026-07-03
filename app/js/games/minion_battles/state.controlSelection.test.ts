import { describe, expect, it } from 'vitest';
import {
    CONTROL_ENEMY_ALPHA_WOLF,
    getControlGroupId,
    isControlEnemy,
    makeControlSelection,
} from './state';

describe('control selection encoding', () => {
    it('makeControlSelection round-trips via getControlGroupId', () => {
        const sel = makeControlSelection('boss');
        expect(sel).toBe('control_enemy:boss');
        expect(getControlGroupId(sel)).toBe('boss');
    });

    it('isControlEnemy accepts new-style selections', () => {
        expect(isControlEnemy(makeControlSelection('boss'))).toBe(true);
        expect(isControlEnemy(makeControlSelection('pack'))).toBe(true);
    });

    it('isControlEnemy accepts the legacy constant', () => {
        expect(isControlEnemy(CONTROL_ENEMY_ALPHA_WOLF)).toBe(true);
        expect(getControlGroupId(CONTROL_ENEMY_ALPHA_WOLF)).toBe('boss');
    });

    it('isControlEnemy rejects spectator and character ids', () => {
        expect(isControlEnemy('spectator')).toBe(false);
        expect(isControlEnemy('char_abc123')).toBe(false);
        expect(isControlEnemy(undefined)).toBe(false);
        expect(isControlEnemy(null)).toBe(false);
        expect(isControlEnemy('')).toBe(false);
        expect(getControlGroupId('spectator')).toBeNull();
        expect(getControlGroupId('char_abc123')).toBeNull();
    });
});
