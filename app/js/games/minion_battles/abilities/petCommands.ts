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
 * commandPetOrderMove — set walk goal to a destination; cancel basicAttack casts (Order: Move).
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
import type { EventBus } from '../game/EventBus';
import type { RecoveryChargeType, AbilityTag } from './Ability';
import { abilityHasTag } from './Ability';
import type { ResolvedTarget } from '../game/types';
import type { PetAITreeContext } from '../game/units/unitAI/pet/context';
import { createCommandCue } from '../game/effects/commandCue';
import { grantRecoveryChargeToAbility } from './abilityUses';
import { applyHeal, DEFAULT_HEAL_PENALTY_PCT } from '../game/units/unitHeal';
import type { AbilityEngineContext } from './AbilityEngineContext';
import { clearPetGuardWander } from '../game/units/unitAI/pet/pet_guardWander';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { canPreempt } from '../game/units/castPriority';
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
    /** When present, the heal shows a green number. */
    eventBus?: EventBus;
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
            applyHeal(
                pet,
                healAmount,
                opts.healPenaltyPct ?? DEFAULT_HEAL_PENALTY_PCT,
                engine.eventBus ? { eventBus: engine.eventBus, sourceUnitId: owner.id } : undefined,
            );
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

    }
    playCommandCues(owner, pets, engine);
}

// ---- Command cue ----

/**
 * Play the command cue (`game/effects/commandCue.ts`) from `owner` to each living pet. Every command in
 * this module calls it once, so all orders share one look. No-op without an owner or `addEffect`.
 */
export function playCommandCues(
    owner: Unit | undefined,
    pets: readonly Unit[],
    engine: { addEffect?(e: unknown): void },
): void {
    if (!owner || !engine.addEffect) return;
    for (const pet of pets) {
        if (!pet.isAlive()) continue;
        engine.addEffect(createCommandCue(owner, pet));
    }
}

// ---- commandPetAbility ----

export interface CommandPetAbilityOpts {
    /**
     * If set, grant this many charges of the given type to `abilityId` on each pet
     * before queuing the order. Use `commandCharge` for player-command abilities so
     * repeated commands always restore a use even when the ability is at 0.
     */
    preGrantCharge?: { chargeType: RecoveryChargeType; amount: number };
    /** The commanding unit; when set, plays the command cue from it to each pet. */
    owner?: Unit;
    /**
     * Cast priority to stamp on each queued order (`BattleOrder.castPriority`; a `CAST_PRIORITY` level, see
     * `game/units/castPriority.ts`). When set, a pet that this priority cannot preempt right now is skipped:
     * no charge is granted and no order is queued. `applyOrderLogic` checks again when the order applies.
     */
    priority?: number;
    /**
     * Parent `abilityId` this command follows up on the same pet (`BattleOrder.followUpOf`, e.g. Pounce →
     * Spirit Flurry). The priority check leaves that running cast out, so the follow-up replaces its parent.
     */
    followUpOf?: string;
}

/**
 * Queue `abilityId` with `targets` on each of the given pets at `engine.gameTick + 1`.
 * Pattern mirrors AlphaWolfSummon: the pet starts its cast on the very next simulation tick.
 * Pass `opts.preGrantCharge` to restore a use before queuing (needed for commandCharge abilities), and
 * `opts.priority` to stamp a cast priority (pets it cannot preempt are skipped), and `opts.followUpOf` when
 * the order continues a running cast that it should replace.
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
    const priority = opts?.priority;
    const followUpOf = opts?.followUpOf;
    const commanded: Unit[] = [];
    for (const pet of pets) {
        if (!pet.isAlive()) continue;
        if (priority !== undefined && !canPreempt(pet, priority, engine.units, engine, followUpOf)) continue;
        if (opts?.preGrantCharge) {
            grantRecoveryChargeToAbility(pet, abilityId, opts.preGrantCharge.chargeType, opts.preGrantCharge.amount);
        }
        orderMgr.queueOrder(currentTick + 1, {
            unitId: pet.id,
            abilityId,
            targets,
            ...(priority !== undefined ? { castPriority: priority } : {}),
            ...(followUpOf !== undefined ? { followUpOf } : {}),
        });
        commanded.push(pet);
    }
    playCommandCues(opts?.owner, commanded, engine as { addEffect?(e: unknown): void });
}

// ---- Order: Attack / Order: Move ----

export interface OrderAttackEngineCtx {
    gameTime: number;
    addEffect(e: unknown): void;
    cancelActiveAbility?(unitId: string, abilityId: string): void;
}

/**
 * Lock each pet onto `targetUnitId` with sticky ordered focus and enter engage.
 * Plays the command cue from `owner` to each pet.
 */
export function commandPetOrderAttack(
    pets: Unit[],
    targetUnitId: string,
    engine: OrderAttackEngineCtx,
    owner?: Unit,
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
    }
    playCommandCues(owner, pets, engine);
}

export interface OrderMoveEngineCtx {
    gameTime: number;
    gameTick: number;
    addEffect?(e: unknown): void;
    cancelActiveAbility?(unitId: string, abilityId: string): void;
}

const BASIC_ATTACK_TAG: AbilityTag = 'basicAttack';

/**
 * Order: Move. Cancel active casts tagged `basicAttack` on each pet, then make the destination the pet's
 * anchor: it walks there and from then on wanders within its def's `anchorRadius` of it (see pet_follow).
 * Non-basic casts are left alone (movement queues via walkIntent).
 */
export function commandPetOrderMove(
    pets: Unit[],
    dest: { x: number; y: number },
    engine: OrderMoveEngineCtx,
    owner?: Unit,
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
        ctx.aiState = 'pet_follow';
        ctx.anchorX = dest.x;
        ctx.anchorY = dest.y;
        ctx.orderedMoveX = undefined;
        ctx.orderedMoveY = undefined;
        ctx.targetUnitId = undefined;
        ctx.orderedFocus = false;
        ctx.heelUntilGameTime = undefined;
        clearPetGuardWander(ctx);

        // Start walking now rather than waiting for the pet's next AI turn.
        pet.setWalkGoal({
            kind: 'cell',
            col: Math.floor(dest.x / CELL_SIZE),
            row: Math.floor(dest.y / CELL_SIZE),
            targetPixel: { x: dest.x, y: dest.y },
        });
    }
    playCommandCues(owner, pets, engine);
}

/**
 * Guard (Order: Move's other mode). Clear each pet's ordered anchor so it anchors on its owner again:
 * it walks back and stays within its def's `anchorRadius` of the owner.
 */
export function commandPetGuard(
    pets: Unit[],
    engine: { addEffect?(e: unknown): void },
    owner?: Unit,
): void {
    for (const pet of pets) {
        if (!pet.isAlive()) continue;
        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_follow';
        ctx.anchorX = undefined;
        ctx.anchorY = undefined;
        ctx.orderedMoveX = undefined;
        ctx.orderedMoveY = undefined;
        ctx.targetUnitId = undefined;
        ctx.orderedFocus = false;
        clearPetGuardWander(ctx);
    }
    playCommandCues(owner, pets, engine);
}
