/**
 * defineConjure — archetype factory for abilities that conjure a held weapon.
 *
 * Timing: one Active window of `duration` seconds. When it starts, any held conjured weapon is
 * dropped as a token and pictures of the new weapon orbit the caster. The caster walks at
 * `moveMult` speed during the window. When it ends, the weapon (`weaponId`, a registered
 * `ConjuredWeaponDef`) is equipped and swaps the caster's weapon abilities.
 *
 * The orbit pictures use the weapon's `tokenKind` art. `orbit` tunes the orbit shape; omitted
 * fields use the orbit effect's defaults.
 */

import { AbilityState, type AbilityRecoveryRule, type AbilityStateEntry, type AbilityStatic } from '../Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import { defineAbility } from '../defineAbility';
import { getConjuredWeaponDef } from '../../game/conjuredWeapons/registry';
import { equipConjuredWeaponAtEnd, startConjureCast, type ConjureOrbitShape } from './conjureCast';

export interface ConjureConfig {
    id: string;
    name: string;
    image: string;
    tags?: AbilityStatic['tags'];
    /** Registered `ConjuredWeaponDef` id equipped when the window ends. */
    weaponId: string;
    resourceCost?: AbilityStatic['resourceCost'];
    /** Default 1. */
    rechargeTurns?: number;
    maxUses?: number;
    recoveries?: readonly AbilityRecoveryRule[];
    /** Seconds of the conjure window. */
    duration: number;
    /** Movement speed multiplier during the window. */
    moveMult: number;
    orbit?: ConjureOrbitShape;
    getTooltipText: (gameState?: unknown) => string[];
    /** Card flavour line; see `AbilityStatic.flavorText`. */
    flavorText?: string;
}

export function defineConjure(config: ConjureConfig): AbilityStatic {
    const { duration, moveMult } = config;
    const abilityTimings: AbilityTimingInterval[] = [
        {
            id: 'conjure',
            start: 0,
            end: duration,
            abilityPhase: AbilityPhase.Active,
            behaviour: equipConjuredWeaponAtEnd(config.weaponId),
        },
    ];

    return defineAbility({
        id: config.id,
        tags: config.tags ?? [],
        name: config.name,
        image: config.image,
        resourceCost: config.resourceCost ?? null,
        resourceCosts: [],
        rechargeTurns: config.rechargeTurns ?? 1,
        maxUses: config.maxUses,
        recoveries: config.recoveries,
        prefireTime: duration,
        targets: [],
        getRange: () => ({ minRange: 0, maxRange: 0 }),
        abilityTimings,
        getAbilityStates(currentTime: number): AbilityStateEntry[] {
            if (currentTime < duration) {
                return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: moveMult } }];
            }
            return [];
        },
        getTooltipText: config.getTooltipText,
        flavorText: config.flavorText,
        beginActiveCast(engine, caster): void {
            const weapon = getConjuredWeaponDef(config.weaponId);
            if (!weapon) throw new Error(`defineConjure: "${config.id}" names unregistered weapon "${config.weaponId}"`);
            startConjureCast(engine, caster, weapon.tokenKind, { duration, ...config.orbit });
        },
    });
}
