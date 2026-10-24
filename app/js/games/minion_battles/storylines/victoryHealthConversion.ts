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
    /** Final Hunger once every change is recorded (the match-end cost, then any post-mission recoveries). */
    hungerAfter: number;
    maxHunger: number;
    /** Hunger loss the match asked for (after heal-wounds), before the floor-at-0 cap. */
    uncappedLoss: number;
}

export interface VictoryHealthConversion {
    hungerBefore: number;
    /** Hunger right after paying the match-end cost, before any Hunger found afterwards. */
    hungerAfterCost: number;
    hungerAfter: number;
    /** Hunger actually paid for health (the match-end loss, capped at the Hunger the character had). */
    hungerCost: number;
    /** Hunger recovered after the cost (e.g. a post-mission choice); 0 when none. */
    hungerFound: number;
    maxHunger: number;
    hpBefore: number;
    hpAfter: number;
    maxHp: number;
}

/**
 * Splits the victory Hunger change into the cost paid for health and any Hunger found afterwards, and how much
 * HP the cost restores. When the cap kept the player from paying the whole loss, the HP bar only fills by the same
 * fraction of its missing HP. Returns null when there is nothing to show (no cost and nothing found, no unit, no max).
 */
export function computeVictoryHealthConversion(input: VictoryHealthConversionInput): VictoryHealthConversion | null {
    const { playerHp, hungerBefore, hungerAfter, maxHunger, uncappedLoss } = input;
    if (!playerHp || !(maxHunger > 0) || !(playerHp.maxHp > 0)) return null;
    // Same floor as `clampCharacterMatchHungerLoss`: the cost never exceeds the Hunger on hand.
    const hungerCost =
        uncappedLoss > 0 ? Math.max(0, Math.min(Math.floor(uncappedLoss), Math.floor(Math.max(0, hungerBefore)))) : 0;
    const hungerAfterCost = hungerBefore - hungerCost;
    const hungerFound = Math.max(0, hungerAfter - hungerAfterCost);
    if (hungerCost <= 0 && hungerFound <= 0) return null;
    const fraction = uncappedLoss > 0 ? Math.min(1, hungerCost / uncappedLoss) : 0;
    const hp = Math.max(0, Math.min(playerHp.maxHp, playerHp.hp));
    return {
        hungerBefore,
        hungerAfterCost,
        hungerAfter,
        hungerCost,
        hungerFound,
        maxHunger,
        hpBefore: hp,
        hpAfter: hp + (playerHp.maxHp - hp) * fraction,
        maxHp: playerHp.maxHp,
    };
}
