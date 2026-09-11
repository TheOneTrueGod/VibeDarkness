import type { CampaignResourceKey } from '../../../types';
import { PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import type { Unit } from '../game/units/Unit';

/** Exhaustion granted per point of heal-penalty injury (`hpInjury`). */
export const EXHAUSTION_PER_WOUND_POINT = 1;
/** Exhaustion granted per HP below wounded max (maxHp − injury − current HP). */
export const EXHAUSTION_PER_MISSING_HP = 0.5;

export const EXHAUSTION_RESOURCE_KEY = 'exhaustion' as const satisfies CampaignResourceKey;

export type MatchExhaustionUnit = {
    hp: number;
    maxHp: number;
    hpInjury: number;
};

/**
 * Match-end exhaustion: 1 per wound point + 0.5 per HP below wounded max, rounded up.
 * Wounded max = Max HP − wound damage; missing HP = wounded max − current HP.
 */
export function computeMatchExhaustion(unit: MatchExhaustionUnit): number {
    const woundPoints = Math.max(0, unit.hpInjury);
    const missingHp = Math.max(0, unit.maxHp - woundPoints - unit.hp);
    const raw =
        woundPoints * EXHAUSTION_PER_WOUND_POINT + missingHp * EXHAUSTION_PER_MISSING_HP;
    return Math.ceil(raw);
}

export function findPlayerUnitForMatchExhaustion(
    units: readonly Unit[],
    localPlayerId: string,
    liveLocalUnit?: Unit,
): Unit | undefined {
    if (liveLocalUnit && liveLocalUnit.characterId === PLAYER_CHARACTER_ID) {
        return liveLocalUnit;
    }
    return units.find(
        (u) => u.ownerId === localPlayerId && u.characterId === PLAYER_CHARACTER_ID,
    );
}

/** Merge match exhaustion into a campaign resource delta. Omits the key when exhaustion is 0. */
export function withExhaustionDelta(
    delta: Partial<Record<CampaignResourceKey, number>> | undefined,
    exhaustion: number,
): Partial<Record<CampaignResourceKey, number>> | undefined {
    if (!Number.isFinite(exhaustion) || exhaustion <= 0) {
        return delta && Object.keys(delta).length > 0 ? delta : undefined;
    }
    return {
        ...delta,
        [EXHAUSTION_RESOURCE_KEY]: exhaustion,
    };
}
