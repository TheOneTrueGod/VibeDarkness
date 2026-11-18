/**
 * Battle variables: named numbers that live for one battle, shared by every system and serialized with checkpoints
 * (`GameState.battleVariables`). One part of the game writes a value and anything else reads it, so a unit's behaviour
 * can follow "how far the fight has got" without knowing who moved it on. For example the Garden Heart sets
 * `GARDEN_GROWTH_PHASE_VARIABLE` as it regrows, and Thorn Fans reads it; a mission without the Heart can set the same
 * variable itself (from a level event, a scenario or `onMissionStart`) to get the same escalation.
 *
 * Reads default to 0 for a variable never set. Only set them from simulation code (it runs identically on every
 * client); never from UI or wall-clock code.
 */

/** Anything that carries the battle's variables (the engine, `EngineContext`, `GameState`). */
export interface BattleVariableHost {
    battleVariables?: Record<string, number>;
}

/** The variable's value, or 0 when it was never set (or `host` carries none). */
export function getBattleVariable(host: unknown, id: string): number {
    const value = (host as BattleVariableHost | null | undefined)?.battleVariables?.[id];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Set the variable. A host with no variable bag (a bare test stub) is left alone. */
export function setBattleVariable(host: unknown, id: string, value: number): void {
    const vars = (host as BattleVariableHost | null | undefined)?.battleVariables;
    if (!vars) return;
    vars[id] = value;
}
