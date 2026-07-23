/**
 * Reusable helpers for player command abilities that affect pets.
 *
 * resolveAbilitySourceUnits — resolve the unit(s) an ability originates from
 *   (e.g. nearest pet rather than the caster). Used by Sic 'em and future variants.
 *
 * commandHeel — instant heal + heel state on all living pets.
 *
 * commandPetAbility — queue an ability order on pet(s) at the next game tick.
 *
 * commandPetOrderAttack — sticky focus order (Order: Attack special).
 *
 * commandPetOrderMove — path to a destination; cancel basicAttack casts (Order: Move).
 *
 * ## Sic 'em → Pounce preview checklist
 *
 * When a command card delegates movement to a pet ability (0704 → 0702 Pounce):
 *
 * 1. **Preview origin** — `createPetSourcedMovementPreview` (not `createPixelTargetPreview`).
 *    Never draw the dash line from the player caster.
 * 2. **Preview path** — terrain-aware via `resolveTerrainAwareMovementDisplacement` /
 *    `computeForcedDisplacement`, matching the delegate's `DashBehaviour`.
 * 3. **Constants** — import `MAX_DASH_DISTANCE` and collision step from the delegate ability
 *    file (0702), do not duplicate literals on the command card.
 * 4. **Anti-patterns** — editing only `getRange` on the command card; straight-line
 *    `Math.hypot` clamp in `renderTargetingPreview`; fixing Pounce without fixing Sic 'em preview.
 *
 * See `abilities/previewHelpers.ts` and `card_defs/SKILL.md` (Command cards section).
 */

import type { Unit } from '../game/units/Unit';
import type { RecoveryChargeType, AbilityTag } from './Ability';
import { abilityHasTag } from './Ability';
import type { ResolvedTarget } from '../game/types';
import type { PetAITreeContext } from '../game/units/unitAI/pet/context';
import { Effect } from '../game/effects/Effect';
import { grantRecoveryChargeToAbility } from './abilityUses';
import { applyHeal, DEFAULT_HEAL_PENALTY_PCT } from '../game/units/unitHeal';
import type { AbilityEngineContext } from './AbilityEngineContext';
import { clearPetGuardWander } from '../game/units/unitAI/pet/pet_guardWander';
export { resolveAbilitySourceUnits } from './abilitySourceUnits';

// ---- resolveAbilitySourceUnits ----
// Implemented in abilitySourceUnits.ts (re-exported above).

// ---- commandHeel ----

export interface HeelOptions {
    /** Fraction of max HP to restore (0–1). Capped at maxHp. */
    healFraction: number;
    /** Maximum distance (px) the pet holds from its owner during heel. */
    tetherRange: number;
    /** Heel duration in game-time seconds. */
    durationSeconds: number;
    /** Overrides DEFAULT_HEAL_PENALTY_PCT for the top-up heal. Revives never bank injury regardless. */
    healPenaltyPct?: number;
}

interface HeelEngineCtx {
    gameTime: number;
    addEffect(e: unknown): void;
}

/**
 * Heal each pet, put them into heel state, and interrupt any active attack.
 * Also adds a green Pulse VFX on each pet so the effect is visible.
 */
export function commandHeel(
    owner: Unit,
    pets: Unit[],
    engine: HeelEngineCtx,
    opts: HeelOptions,
): void {
    for (const pet of pets) {
        const healAmount = Math.max(1, Math.floor(pet.maxHp * opts.healFraction));

        if (!pet.isAlive()) {
            pet.active = true;
            // Revival is a heal, but always at 0% penalty — resurrecting a pet never banks hpInjury.
            pet.hp = Math.min(healAmount, pet.getEffectiveMaxHp());
            pet.clearMovement();
            pet.clearAbilityNote();
            if (owner.isAlive()) {
                pet.x = owner.x;
                pet.y = owner.y;
            }
        } else {
            applyHeal(pet, healAmount, opts.healPenaltyPct ?? DEFAULT_HEAL_PENALTY_PCT);
        }

        // Heel state — clears sticky attack / ordered move.
        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_heel';
        ctx.heelUntilGameTime = engine.gameTime + opts.durationSeconds;
        ctx.heelTetherRange = opts.tetherRange;
        ctx.targetUnitId = undefined;
        ctx.orderedFocus = false;
        ctx.orderedMoveX = undefined;
        ctx.orderedMoveY = undefined;
        clearPetGuardWander(ctx);

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

export interface CommandPetAbilityOpts {
    /**
     * If set, grant this many charges of the given type to `abilityId` on each pet
     * before queuing the order. Use `commandCharge` for player-command abilities so
     * repeated commands always restore a use even when the ability is at 0.
     */
    preGrantCharge?: { chargeType: RecoveryChargeType; amount: number };
}

/**
 * Queue `abilityId` with `targets` on each of the given pets at `engine.gameTick + 1`.
 * Pattern mirrors AlphaWolfSummon: the pet starts its cast on the very next simulation tick.
 * Pass `opts.preGrantCharge` to restore a use before queuing (needed for commandCharge abilities).
 */
export function commandPetAbility(
    pets: Unit[],
    abilityId: string,
    targets: ResolvedTarget[],
    engine: AbilityEngineContext,
    opts?: CommandPetAbilityOpts,
): void {
    if (!engine.state?.orderMgr || engine.gameTick === undefined) return;
    const { orderMgr } = engine.state;
    const currentTick = engine.gameTick;
    for (const pet of pets) {
        if (!pet.isAlive()) continue;
        if (opts?.preGrantCharge) {
            grantRecoveryChargeToAbility(pet, abilityId, opts.preGrantCharge.chargeType, opts.preGrantCharge.amount);
        }
        orderMgr.queueOrder(currentTick + 1, {
            unitId: pet.id,
            abilityId,
            targets,
        });
    }
}

// ---- Order: Attack / Order: Move ----

const ORDER_ATTACK_BURST_COLORS = [0xff4444, 0xcc2222, 0x881111] as const;

export interface OrderAttackEngineCtx {
    gameTime: number;
    addEffect(e: unknown): void;
    cancelActiveAbility?(unitId: string, abilityId: string): void;
}

/**
 * Lock each pet onto `targetUnitId` with sticky ordered focus and enter engage.
 * Plays a subtle red burst on the pet.
 */
export function commandPetOrderAttack(
    pets: Unit[],
    targetUnitId: string,
    engine: OrderAttackEngineCtx,
): void {
    for (const pet of pets) {
        if (!pet.isAlive()) continue;
        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_engage';
        ctx.targetUnitId = targetUnitId;
        ctx.orderedFocus = true;
        ctx.heelUntilGameTime = undefined;
        ctx.orderedMoveX = undefined;
        ctx.orderedMoveY = undefined;
        clearPetGuardWander(ctx);

        engine.addEffect(
            new Effect({
                x: pet.x,
                y: pet.y,
                duration: 0.35,
                effectType: 'Pulse',
                effectData: { colors: [...ORDER_ATTACK_BURST_COLORS] },
            }),
        );
    }
}

export interface OrderMoveEngineCtx {
    gameTime: number;
    gameTick: number;
    addEffect?(e: unknown): void;
    cancelActiveAbility?(unitId: string, abilityId: string): void;
    terrainManager?: {
        grid: {
            worldToGrid(x: number, y: number): { col: number; row: number };
        };
        findGridPath(
            fromCol: number,
            fromRow: number,
            toCol: number,
            toRow: number,
        ): { col: number; row: number }[] | null;
    } | null;
}

const BASIC_ATTACK_TAG: AbilityTag = 'basicAttack';

/**
 * Cancel active casts tagged `basicAttack` on each pet, then queue an ordered move
 * to the world-pixel destination. Non-basic casts are left alone (movement queues via walkIntent).
 */
export function commandPetOrderMove(
    pets: Unit[],
    dest: { x: number; y: number },
    engine: OrderMoveEngineCtx,
): void {
    for (const pet of pets) {
        if (!pet.isAlive()) continue;

        // Cancel only basic-attack casts.
        for (const active of [...pet.activeAbilities]) {
            if (abilityHasTag(active.abilityId, BASIC_ATTACK_TAG)) {
                engine.cancelActiveAbility?.(pet.id, active.abilityId);
            }
        }

        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_ordered_move';
        ctx.orderedMoveX = dest.x;
        ctx.orderedMoveY = dest.y;
        ctx.targetUnitId = undefined;
        ctx.orderedFocus = false;
        ctx.heelUntilGameTime = undefined;
        clearPetGuardWander(ctx);

        const tm = engine.terrainManager;
        if (tm) {
            const from = tm.grid.worldToGrid(pet.x, pet.y);
            const to = tm.grid.worldToGrid(dest.x, dest.y);
            const path = tm.findGridPath(from.col, from.row, to.col, to.row);
            if (path && path.length > 0) {
                pet.setMovement(path, undefined, engine.gameTick, { x: dest.x, y: dest.y });
            } else {
                // Still store intent via a single-cell path if possible; AI will retry / drop.
                pet.setMovement(
                    [{ col: to.col, row: to.row }],
                    undefined,
                    engine.gameTick,
                    { x: dest.x, y: dest.y },
                );
            }
        }
    }
}
