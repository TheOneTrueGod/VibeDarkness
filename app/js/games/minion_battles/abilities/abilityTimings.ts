/**
 * Ability phase timings and colors for UI (e.g. segmented cooldown ring).
 * Use abilityTimings on ability defs to describe windup / active / cooldown etc.
 */

/** Phase of an ability's execution (for segment coloring). */
export enum AbilityPhase {
    Windup = 'windup',
    Active = 'active',
    Cooldown = 'cooldown',
    Iframe = 'iframe',
    Juggernaut = 'juggernaut',
}

/** Duration (seconds) and phase for one segment of the ability cycle. */
export interface AbilityTiming {
    duration: number;
    abilityPhase: AbilityPhase;
}

/**
 * Total duration (seconds) of the ability cycle including cooldown.
 * Uses abilityTimings when present, otherwise prefireTime + cooldownTime.
 */
export function getTotalAbilityDuration(ability: {
    abilityTimings?: AbilityTiming[];
    prefireTime: number;
    cooldownTime: number;
}): number {
    if (ability.abilityTimings && ability.abilityTimings.length > 0) {
        return ability.abilityTimings.reduce((sum, t) => sum + t.duration, 0);
    }
    return ability.prefireTime + ability.cooldownTime;
}

/** Colors for each phase in the circular progress indicator. */
export const ABILITY_PHASE_COLORS: Record<AbilityPhase, string> = {
    [AbilityPhase.Windup]: '#f97316', // orange
    [AbilityPhase.Active]: '#ef4444', // red
    [AbilityPhase.Cooldown]: '#eab308', // yellow
    [AbilityPhase.Iframe]: '#ffffff', // white
    [AbilityPhase.Juggernaut]: '#d1d5db', // light gray
};
