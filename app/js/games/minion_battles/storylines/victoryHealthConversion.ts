/** Hunger to health conversion shown on the victory popover (pure math; the visuals live in the UI layer). */

/** Battle-layer facts captured at the moment of victory and handed up with `onVictory`. */
export interface VictorySnapshot {
    /** Objective rows of the mission (label + completed), in display order. */
    objectives: Array<{ id: string; label: string; completed: boolean }>;
    /** Local player unit at match end; null for spectators / NPC controllers / no unit. */
    playerHp: { hp: number; maxHp: number } | null;
}

export interface VictoryHealthConversionInput {
    /** Local player unit at match end; null for spectators / NPC controllers / no unit. */
    playerHp: { hp: number; maxHp: number } | null;
    hungerBefore: number;
    hungerAfter: number;
    maxHunger: number;
    /** Hunger loss the match asked for (after heal-wounds), before the floor-at-0 cap. */
    uncappedLoss: number;
}

export interface VictoryHealthConversion {
    hungerBefore: number;
    hungerAfter: number;
    maxHunger: number;
    hpBefore: number;
    hpAfter: number;
    maxHp: number;
}

/**
 * How much Hunger converts into HP. When the cap kept the player from paying the whole loss, the HP bar only
 * fills by the same fraction of its missing HP. Returns null when nothing converts (no loss, no unit, no max).
 */
export function computeVictoryHealthConversion(input: VictoryHealthConversionInput): VictoryHealthConversion | null {
    const { playerHp, hungerBefore, hungerAfter, maxHunger, uncappedLoss } = input;
    if (!playerHp || !(maxHunger > 0) || !(playerHp.maxHp > 0)) return null;
    const spent = Math.max(0, hungerBefore - hungerAfter);
    if (!(spent > 0) || !(uncappedLoss > 0)) return null;
    const fraction = Math.min(1, spent / uncappedLoss);
    const hp = Math.max(0, Math.min(playerHp.maxHp, playerHp.hp));
    return {
        hungerBefore,
        hungerAfter,
        maxHunger,
        hpBefore: hp,
        hpAfter: hp + (playerHp.maxHp - hp) * fraction,
        maxHp: playerHp.maxHp,
    };
}
