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

/** Colors for each phase in the circular progress indicator. */
export const ABILITY_PHASE_COLORS: Record<AbilityPhase, string> = {
    [AbilityPhase.Windup]: '#f97316', // orange
    [AbilityPhase.Active]: '#ef4444', // red
    [AbilityPhase.Cooldown]: '#eab308', // yellow
    [AbilityPhase.Iframe]: '#ffffff', // white
    [AbilityPhase.Juggernaut]: '#d1d5db', // light gray
};
