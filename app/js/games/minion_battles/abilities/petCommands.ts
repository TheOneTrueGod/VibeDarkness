/**
 * Reusable helpers for player command abilities that affect pets.
 *
 * resolveAbilitySourceUnits — resolve the unit(s) an ability originates from
 *   (e.g. nearest pet rather than the caster). Used by Sic 'em and future variants.
 *
 * commandHeel — instant heal + heel state on all living pets.
 *
 * commandPetAbility — queue an ability order on pet(s) at the next game tick.
 */

import type { Unit } from '../game/units/Unit';
import type { AbilityStatic } from './Ability';
import type { ResolvedTarget } from '../game/types';
import type { PetAITreeContext } from '../game/units/unitAI/pet/context';
import { getLivingPetsOfUnit } from '../game/units/petHelpers';
import { Effect } from '../game/effects/Effect';

// ---- Engine context shape needed by these helpers ----

interface PetCommandEngineCtx {
    gameTime: number;
    gameTick: number;
    roundNumber?: number;
    units: Unit[];
    addEffect(effect: Effect): void;
    state: {
        orderMgr: {
            queueOrder(
                atTick: number,
                order: { unitId: string; abilityId: string; targets: ResolvedTarget[] },
            ): void;
        };
    };
}

// ---- resolveAbilitySourceUnits ----

/**
 * Resolve the unit(s) an ability originates from based on its `abilitySource` field.
 * If no `abilitySource` is set, returns `[caster]`.
 *
 * Supported selectors:
 *  - `'nearest'` — the single living pet of `caster` closest to `aimPoint`.
 *  - `'all'` — all living pets of `caster`.
 *
 * `aimPoint` is optional; when absent (e.g. for unit-targeted abilities), nearest
 * is determined by distance from the caster.
 */
export function resolveAbilitySourceUnits(
    ability: AbilityStatic & { abilitySource?: { type: 'pet'; selector: 'nearest' | 'all' } },
    caster: Unit,
    units: readonly Unit[],
    aimPoint?: { x: number; y: number },
): Unit[] {
    const src = ability.abilitySource;
    if (!src || src.type !== 'pet') return [caster];

    const pets = getLivingPetsOfUnit(caster, units);
    if (pets.length === 0) return [];

    if (src.selector === 'all') return pets;

    // selector === 'nearest'
    const pivot = aimPoint ?? caster;
    let nearest: Unit = pets[0]!;
    let nearestDist = Math.hypot(nearest.x - pivot.x, nearest.y - pivot.y);
    for (let i = 1; i < pets.length; i++) {
        const p = pets[i]!;
        const d = Math.hypot(p.x - pivot.x, p.y - pivot.y);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
        }
    }
    return [nearest];
}

// ---- commandHeel ----

export interface HeelOptions {
    /** Fraction of max HP to restore (0–1). Capped at maxHp. */
    healFraction: number;
    /** Maximum distance (px) the pet holds from its owner during heel. */
    tetherRange: number;
    /** Heel duration in game-time seconds. */
    durationSeconds: number;
}

/**
 * Heal each pet, put them into heel state, and interrupt any active attack.
 * Also adds a green Pulse VFX on each pet so the effect is visible.
 */
export function commandHeel(
    owner: Unit,
    pets: Unit[],
    engine: PetCommandEngineCtx,
    opts: HeelOptions,
): void {
    for (const pet of pets) {
        const healAmount = Math.max(1, Math.floor(pet.maxHp * opts.healFraction));

        if (!pet.isAlive()) {
            pet.active = true;
            pet.hp = healAmount;
            pet.clearMovement();
            pet.clearAbilityNote();
            if (owner.isAlive()) {
                pet.x = owner.x;
                pet.y = owner.y;
            }
        } else {
            pet.hp = Math.min(pet.maxHp, pet.hp + healAmount);
        }

        // Heel state.
        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_heel';
        ctx.heelUntilGameTime = engine.gameTime + opts.durationSeconds;
        ctx.heelTetherRange = opts.tetherRange;
        ctx.targetUnitId = undefined;

        // Visual: green pulse at the pet's position.
        engine.addEffect(
            new Effect({
                x: pet.x,
                y: pet.y,
                duration: 0.5,
                effectType: 'Pulse',
                effectData: { colors: [0x22cc44, 0x11882b, 0x0a4a18] },
            }),
        );
    }

    // Suppress "owner unused" lint — owner is the conceptual caller; included for future use.
    void owner;
}

// ---- commandPetAbility ----

/**
 * Queue `abilityId` with `targets` on each of the given pets at `engine.gameTick + 1`.
 * Pattern mirrors AlphaWolfSummon: the pet starts its cast on the very next simulation tick.
 */
export function commandPetAbility(
    pets: Unit[],
    abilityId: string,
    targets: ResolvedTarget[],
    engine: PetCommandEngineCtx,
): void {
    for (const pet of pets) {
        if (!pet.isAlive()) continue;
        engine.state.orderMgr.queueOrder(engine.gameTick + 1, {
            unitId: pet.id,
            abilityId,
            targets,
        });
    }
}
