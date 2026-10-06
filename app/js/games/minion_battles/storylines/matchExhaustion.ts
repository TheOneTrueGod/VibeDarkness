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
    hpExhaustion?: number;
};

/**
 * Match-end exhaustion: 1 per wound point + 0.5 per HP below wounded max, rounded up.
 * Wounded max = Max HP − exhaustion reserve − wound damage; missing HP = wounded max − current HP.
 */
export function computeMatchExhaustion(unit: MatchExhaustionUnit): number {
    const woundPoints = Math.max(0, unit.hpInjury);
    const exhaustionReserve = Math.max(0, unit.hpExhaustion ?? 0);
    const missingHp = Math.max(0, unit.maxHp - exhaustionReserve - woundPoints - unit.hp);
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

/**
 * Fold signed exhaustion changes (positive = gain, negative = recovery) into `start`
 * strictly in order, clamping to [0, cap] after every step. Order matters because of the
 * clamp: +5, +5, −20, +5 ends at 5, not 0. Non-finite changes are skipped.
 */
export function applyOrderedExhaustionChanges(
    start: number,
    changes: readonly number[],
    cap: number = Infinity,
): number {
    let value = Number.isFinite(start) ? start : 0;
    for (const change of changes) {
        if (!Number.isFinite(change)) continue;
        value = Math.min(cap, Math.max(0, value + change));
    }
    return value;
}

/**
 * Apply heal-wounds reduction to exhaustion.
 * Wounds reduce exhaustion 1-to-1 (1 exhaustion per wound point).
 * Guards against non-finite values.
 */
export function applyHealWoundsToExhaustion(
    exhaustion: number,
    healWounds: number | undefined,
): number {
    if (!Number.isFinite(exhaustion)) return exhaustion;
    const heal = healWounds ?? 0;
    if (!Number.isFinite(heal) || heal < 0) return exhaustion;
    return Math.max(0, exhaustion - heal);
}
