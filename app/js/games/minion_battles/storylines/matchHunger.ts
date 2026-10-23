import type { CampaignResourceKey } from '../../../types';
import { PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import type { Unit } from '../game/units/Unit';

/** Hunger lost per point of heal-penalty injury (`hpInjury`). */
export const HUNGER_PER_WOUND_POINT = 1;
/** Hunger lost per HP below wounded max (maxHp - injury - current HP). */
export const HUNGER_PER_MISSING_HP = 0.5;

export const HUNGER_RESOURCE_KEY = 'hunger' as const satisfies CampaignResourceKey;

export type MatchHungerUnit = {
    hp: number;
    maxHp: number;
    hpInjury: number;
};

/**
 * Match-end Hunger loss (a positive number): 1 per wound point + 0.5 per HP below wounded max, rounded up.
 * Wounded max = Max HP - wound damage (Max HP already includes any fight-start Hunger penalty);
 * missing HP = wounded max - current HP.
 */
export function computeMatchHungerLoss(unit: MatchHungerUnit): number {
    const woundPoints = Math.max(0, unit.hpInjury);
    const missingHp = Math.max(0, unit.maxHp - woundPoints - unit.hp);
    const raw = woundPoints * HUNGER_PER_WOUND_POINT + missingHp * HUNGER_PER_MISSING_HP;
    return Math.ceil(raw);
}

export function findPlayerUnitForMatchHunger(
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

/**
 * Merge a signed Hunger delta (negative = lost, positive = recovered) into a campaign resource delta.
 * Omits the key when the delta is 0.
 */
export function withHungerDelta(
    delta: Partial<Record<CampaignResourceKey, number>> | undefined,
    hungerDelta: number,
): Partial<Record<CampaignResourceKey, number>> | undefined {
    if (!Number.isFinite(hungerDelta) || hungerDelta === 0) {
        return delta && Object.keys(delta).length > 0 ? delta : undefined;
    }
    return {
        ...delta,
        [HUNGER_RESOURCE_KEY]: hungerDelta,
    };
}

/**
 * Fold signed Hunger changes (negative = lost, positive = recovered) into `start`
 * strictly in order, clamping to [0, max] after every step. Order matters because of the
 * clamp: -20, +30, -5 from 100 ends at 95, while +30, -20, -5 ends at 75. Non-finite changes are skipped.
 */
export function applyOrderedHungerChanges(
    start: number,
    changes: readonly number[],
    max: number = Infinity,
): number {
    let value = Number.isFinite(start) ? start : 0;
    for (const change of changes) {
        if (!Number.isFinite(change)) continue;
        value = Math.min(max, Math.max(0, value + change));
    }
    return value;
}

/**
 * Apply heal-wounds reduction to a Hunger loss (positive number).
 * Wounds reduce the loss 1-to-1 (1 Hunger per wound point).
 * Guards against non-finite values.
 */
export function applyHealWoundsToHungerLoss(
    hungerLoss: number,
    healWounds: number | undefined,
): number {
    if (!Number.isFinite(hungerLoss)) return hungerLoss;
    const heal = healWounds ?? 0;
    if (!Number.isFinite(heal) || heal < 0) return hungerLoss;
    return Math.max(0, hungerLoss - heal);
}
