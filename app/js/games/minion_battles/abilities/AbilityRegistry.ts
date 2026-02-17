/**
 * AbilityRegistry - Central map of all abilities keyed by ID.
 *
 * Import and register every ability here so that the rest of the
 * system can look them up by ID string.
 */

import type { AbilityStatic } from './Ability';
import { ThrowKnife } from './ThrowKnife';
import { DodgeAbility } from '../card_defs/0101_Dodge/0101Ability';
import { EnemyArcherShotAbility } from '../card_defs/0001_EnemyArcherShot/0001Ability';

const ABILITY_MAP: Map<string, AbilityStatic> = new Map();

function register(ability: AbilityStatic): void {
    ABILITY_MAP.set(ability.id, ability);
}

// -- Register all abilities --
register(ThrowKnife);
register(DodgeAbility);
register(EnemyArcherShotAbility);

/** Look up an ability by its ID. */
export function getAbility(id: string): AbilityStatic | undefined {
    return ABILITY_MAP.get(id);
}

/** Get all registered abilities. */
export function getAllAbilities(): AbilityStatic[] {
    return Array.from(ABILITY_MAP.values());
}

/** Check if an ability ID is registered. */
export function hasAbility(id: string): boolean {
    return ABILITY_MAP.has(id);
}
