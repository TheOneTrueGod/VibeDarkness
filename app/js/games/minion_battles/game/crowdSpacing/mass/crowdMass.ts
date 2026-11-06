/**
 * CrowdSpacing mass for the mass resolver. Pure data: def override, else size tier (plus any tier
 * bonus), then the boss multiplier.
 */

import type { Unit } from '../../units/Unit';
import { UnitTag, hasUnitTag } from '../../units/unitTag';
import { UNIT_SIZE_MAP, type UnitSize } from '../../units/unit_defs/unitConstants';
import { PLAYER_CHARACTER_ID, getUnitDefSize } from '../../units/unit_defs/unitDef';
import {
    CROWD_MASS_BOSS_MULTIPLIER,
    CROWD_MASS_BY_SIZE,
    CROWD_MASS_PLAYER_SIZE_TIER_BONUS,
    nearestUnitSizeForRadius,
    shiftUnitSizeTier,
} from './massConstants';

/**
 * A player's own character (not a summon / pet / NPC they control). Other units with the same
 * `ownerId` yield to it in CrowdSpacing, and it gets {@link CROWD_MASS_PLAYER_SIZE_TIER_BONUS}.
 */
export function isOwnPlayerCharacter(unit: Unit): boolean {
    return unit.characterId === PLAYER_CHARACTER_ID && unit.isPlayerControlled();
}

/**
 * The unit's size tier for mass: its def `size` when the unit's radius still matches it, otherwise the
 * tier nearest its actual radius (units without a def size, portrait / per-spawn radius overrides).
 */
export function getCrowdSizeTier(unit: Pick<Unit, 'characterId' | 'radius'>): UnitSize {
    const defSize = getUnitDefSize(unit.characterId);
    if (defSize && UNIT_SIZE_MAP[defSize] === unit.radius) return defSize;
    return nearestUnitSizeForRadius(unit.radius);
}

/** Extra size tiers the unit weighs as (players' own characters: {@link CROWD_MASS_PLAYER_SIZE_TIER_BONUS}). */
export function getCrowdSizeTierBonus(unit: Unit): number {
    return isOwnPlayerCharacter(unit) ? CROWD_MASS_PLAYER_SIZE_TIER_BONUS : 0;
}

/**
 * CrowdSpacing mass: def `crowdMass` override if set, else the size-tier mass (`CROWD_MASS_BY_SIZE`) of
 * the unit's tier shifted by {@link getCrowdSizeTierBonus}, multiplied by `CROWD_MASS_BOSS_MULTIPLIER`
 * when the unit is tagged `Boss`.
 * Bracing (infinite mass) and team resistance are applied by the resolver, not here.
 */
export function getCrowdMass(unit: Unit): number {
    const base =
        unit.crowdMassOverride ??
        CROWD_MASS_BY_SIZE[shiftUnitSizeTier(getCrowdSizeTier(unit), getCrowdSizeTierBonus(unit))];
    return hasUnitTag(unit, UnitTag.Boss) ? base * CROWD_MASS_BOSS_MULTIPLIER : base;
}
