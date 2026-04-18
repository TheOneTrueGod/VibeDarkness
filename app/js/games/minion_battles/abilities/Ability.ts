/**
 * Ability - Static base class for all abilities.
 *
 * Abilities are defined as static classes so that we can reference them
 * by ID (stored on the server) and look them up in the AbilityRegistry.
 * Each ability class holds all its properties as statics.
 */

import type { TargetDef } from './targeting';
import type { ResolvedTarget } from '../game/types';
import type { ActiveAbility } from '../game/types';
import type { Unit } from '../game/units/Unit';
import type { AbilityTimingEntry } from './abilityTimings';
import type { CardDefId } from '../card_defs/types';

/** Minimal graphics interface for drawing ability previews (Pixi Graphics–compatible). */
export interface IAbilityPreviewGraphics {
    clear(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    circle(x: number, y: number, radius: number): void;
    fill(options: { color: number; alpha?: number }): void;
    stroke(options: { color: number; width: number; alpha?: number }): void;
}

/** Resource cost for using an ability. */
export interface ResourceCost {
    resourceId: string;
    amount: number;
    /** If true, can be used while resource > 0, then pays full amount (may go negative). */
    allowPartialIfPositive?: boolean;
}

/** Possible ability states returned by getAbilityStates. */
export enum AbilityState {
    /** Slows the caster's movement. Data: { amount: number } (speed multiplier, e.g. 0.3 = 30% speed). */
    MOVEMENT_PENALTY = 'movement_penalty',
    /** Unit cannot be hit by projectiles. No data. */
    IFRAMES = 'iframes',
}

/** A single active state produced by an ability at a given time. */
export type AbilityStateEntry =
    | { state: AbilityState.MOVEMENT_PENALTY; data: { amount: number } }
    | { state: AbilityState.IFRAMES; data?: Record<string, never> };

/** AI-specific settings that control when the AI will use this ability. */
export interface AbilityAISettings {
    /** Minimum distance (px) to target for the AI to consider using this ability. */
    minRange: number;
    /** Maximum distance (px) to target for the AI to consider using this ability. */
    maxRange: number;
    /** Max uses per round (for enemies). Omitted = no limit. */
    maxUsesPerRound?: number;
    /** Priority when multiple abilities can be used. Higher = preferred. Default 0. */
    priority?: number;
}

export type AbilityKeyword = 'exhaust';

/**
 * Simple capability / classification tags on an ability (distinct from structured `keywords` like exhaust).
 * Extend this union when new tags are needed.
 */
export type AbilityTag = 'priority';

type AbilityTagResolver = (abilityId: string) => readonly AbilityTag[];

let abilityTagResolver: AbilityTagResolver | null = null;

/** Wired from `AbilityRegistry` after abilities are registered; avoids circular imports into `abilityUses`. */
export function setAbilityTagResolver(resolver: AbilityTagResolver): void {
    abilityTagResolver = resolver;
}

export function getAbilityTagsForId(abilityId: string): readonly AbilityTag[] {
    return abilityTagResolver?.(abilityId) ?? [];
}

export function abilityHasTag(abilityId: string, tag: AbilityTag): boolean {
    return getAbilityTagsForId(abilityId).includes(tag);
}

export interface AbilityKeywordDefs {
    exhaust: {
        newCards?: {
            cardDefId: CardDefId;
            abilityId: string;
            location: 'deck' | 'hand' | 'discard';
            rounds: number;
            quantity?: number;
        }[];
    };
}

/** The shape every static ability class must implement. */
export interface AbilityStatic {
    /** Unique ability ID. */
    readonly id: string;
    /** Display name. */
    readonly name: string;
    /** Image URL or SVG string for the card. */
    readonly image: string;
    /** Resource cost to use the ability. Null means free. */
    readonly resourceCost: ResourceCost | null;
    /** Optional multi-resource costs. If set, this takes precedence over resourceCost. */
    readonly resourceCosts?: ResourceCost[];
    /** Rounds the card spends in exile before returning to deck. */
    readonly rechargeTurns: number;
    /** Ordered list of targets the player must select. */
    readonly targets: TargetDef[];
    /** Optional ability keywords that alter card lifecycle behavior. */
    readonly keywords?: Partial<{ [K in AbilityKeyword]: AbilityKeywordDefs[K] }>;
    /** Optional tags (e.g. recovery-charge priority). Distinct from `keywords`. */
    readonly tags?: readonly AbilityTag[];
    /**
     * Optional target resolver. If omitted, callers should use `ability.targets`.
     * Use when target count/labels depend on runtime state (e.g. research).
     */
    getTargets?(caster?: Unit, gameState?: unknown): TargetDef[];
    /** AI settings controlling when this ability is used (range check). */
    readonly aiSettings?: AbilityAISettings;
    /**
     * Time in seconds before the ability's main effect typically fires (windup / telegraph end).
     * The engine calls `doCardEffect` every tick until the cast ends; use this (or interval ids from
     * `abilityTimings`) inside `doCardEffect` for threshold checks. `AbilityBase` also uses it for the
     * default movement penalty until `prefireTime` elapses unless `getAbilityStates` is overridden.
     * Use `0` when the main effect is immediate.
     *
     * Cast **duration** and removal of the active ability entry come from `abilityTimings`
     * (`getTotalAbilityDuration` = `max(end)`), not from `prefireTime` alone.
     */
    readonly prefireTime: number;

    /**
     * Half-open timing intervals for UI (timeline, segmented cooldown ring) and duration (`max(end)`).
     * Required on every ability; use `abilities/abilityTimings.ts` helpers.
     */
    readonly abilityTimings: AbilityTimingEntry[];

    /**
     * Optional. When provided (with `caster` / `gameState`), overrides `abilityTimings` for that cast
     * (timeline, `getTotalAbilityDurationForCast`). Registry tests and static fallbacks still use `abilityTimings`.
     */
    getAbilityTimings?(caster?: Unit, gameState?: unknown): AbilityTimingEntry[];

    /**
     * Get tooltip lines for the card UI. Use {value} in a line for dynamic parts
     * (e.g. "Hit {1} enemy for {8} damage"). Dynamic segments are rendered in a distinct colour.
     */
    getTooltipText(gameState?: unknown): string[];

    /**
     * Execute the ability's effect over time using threshold checks.
     *
     * Called every tick while the ability is active. `prevTime` and `currentTime` are seconds elapsed
     * since the cast started. Fire one-shots with edge checks (e.g. `prevTime < 0.3 && currentTime >= 0.3`).
     * For repeating logic during a phase, gate on elapsed time or on `abilityTimings` (e.g. via helpers
     * in `abilityTimings.ts`), not only on `prefireTime`.
     *
     * The engine removes the active ability when `currentTime >= getTotalAbilityDuration(this)` (derived
     * from non-empty `abilityTimings`). That is independent of what `getAbilityStates` returns.
     *
     * On the first tick, `prevTime` is 0.
     */
    doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void;

    /**
     * Optional. Called exactly once when an active ability entry is created (same tick as the order
     * that started the cast). Use for one-time setup (snapshots, resolved positions) and store data on
     * `active.castPayload` instead of relying on the first `doCardEffect` tick or phase boundaries.
     */
    beginActiveCast?(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        active: ActiveAbility,
    ): void;

    /**
     * Return active ability states at the given elapsed time (e.g. movement penalties, blocking).
     * Used by the engine alongside other unit logic; it does **not** control when the cast ends.
     * The active ability entry is removed when elapsed time reaches `getTotalAbilityDuration` from
     * `abilityTimings`, regardless of whether this method returns an empty list earlier or later.
     */
    getAbilityStates(currentTime: number): AbilityStateEntry[];

    /**
     * Optional. When implemented, `Unit` prefers this over `getAbilityStates` so per-cast data
     * (e.g. `castPayload` from `beginActiveCast`) can affect movement penalties and similar.
     */
    getAbilityStatesForActive?(currentTime: number, active: ActiveAbility): AbilityStateEntry[];

    /**
     * Optional. Render a preview while the ability is active (e.g. enemy telegraph).
     * Visible to all players. Called each frame until the ability ends.
     */
    renderActivePreview?(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void;

    /**
     * Optional. If provided, player-targeting range is validated (min/max distance).
     * For unit targets, distance is caster-to-target-unit center.
     */
    getRange?(caster: Unit): { minRange: number; maxRange: number } | null;

    /**
     * Optional. Render targeting preview using Pixi Graphics (range rings, crosshair, etc.).
     * Called each frame while the player is selecting a target.
     */
    renderTargetingPreview?(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
        gameState?: unknown,
    ): void;

    /**
     * Optional. Render additional targeting preview for already-selected targets (for multi-target abilities).
     * Called immediately after renderTargetingPreview, once per frame while selecting targets.
     */
    renderTargetingPreviewSelectedTargets?(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
        gameState?: unknown,
    ): void;

    /**
     * Optional. If this ability is currently providing a block (e.g. Raise Shield), return the arc in radians.
     * The arc is the range of angles (from the defender's perspective) from which an attack will be blocked.
     * Called when checking if an attack can be blocked; only blocking abilities implement this.
     */
    getBlockingArc?(
        caster: Unit,
        activeAbility: ActiveAbility,
        currentTime: number,
    ): { arcStartAngle: number; arcEndAngle: number } | null;

    /**
     * Called on this ability when its attack is blocked by a blocking ability (e.g. Raise Shield).
     * Each ability implements the behaviour when its attack is blocked: e.g. projectile abilities
     * destroy the projectile, melee abilities do nothing, charging abilities knock back the attacker.
     */
    onAttackBlocked(
        engine: unknown,
        defender: Unit,
        attackInfo: AttackBlockedInfo,
    ): void;

    /**
     * Optional. Called by projectile logic when a projectile reaches max range or hits a target.
     * Use this for on-expire side effects like explosions.
     */
    onProjectileExpired?(
        engine: unknown,
        caster: Unit,
        projectile: unknown,
        hitUnitId?: string,
    ): void;

    /**
     * Optional. Called on the blocking ability when it successfully blocks an attack.
     * Receives the engine, defender (unit holding the shield), and attackInfo (includes attackSourceX/Y for retaliation direction).
     */
    onBlockSuccess?(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void;
}

/** Information about an attack that was blocked. */
export interface AttackBlockedInfo {
    type: 'projectile' | 'melee' | 'charging';
    /** Present for projectile: the projectile. The attacking ability should deactivate it (e.g. set active = false). */
    projectile?: unknown;
    /** Unit ID of the attacker. */
    sourceUnitId?: string;
    /** World position of the attack source (projectile position or attacker position). Used for retaliation direction. */
    attackSourceX?: number;
    attackSourceY?: number;
}

/**
 * Check whether a unit can afford the resource cost for an ability.
 */
export function canAffordAbility(unit: Unit, ability: AbilityStatic): boolean {
    for (const cost of getAbilityResourceCosts(ability)) {
        const resource = unit.getResource(cost.resourceId);
        if (!resource) return false;
        if (cost.allowPartialIfPositive) {
            if (resource.current <= 0) return false;
            continue;
        }
        if (!resource.canAfford(cost.amount)) return false;
    }
    return true;
}

/**
 * Spend the resource cost for an ability. Returns false if cannot afford.
 */
export function spendAbilityCost(unit: Unit, ability: AbilityStatic): boolean {
    const costs = getAbilityResourceCosts(ability);
    if (costs.length === 0) return true;
    if (!canAffordAbility(unit, ability)) return false;
    for (const cost of costs) {
        const resource = unit.getResource(cost.resourceId);
        if (!resource) return false;
        if (cost.allowPartialIfPositive) {
            resource.current -= cost.amount;
            continue;
        }
        if (!resource.spend(cost.amount)) return false;
    }
    return true;
}

/**
 * Refund the resource cost for an ability (e.g. when the ability is interrupted).
 */
export function refundAbilityCost(unit: Unit, ability: AbilityStatic): void {
    for (const cost of getAbilityResourceCosts(ability)) {
        const resource = unit.getResource(cost.resourceId);
        if (resource) resource.add(cost.amount);
    }
}

/** Resolve runtime targets for an ability (dynamic if provided, otherwise static). */
export function getAbilityTargets(ability: AbilityStatic, caster?: Unit, gameState?: unknown): TargetDef[] {
    return ability.getTargets ? ability.getTargets(caster, gameState) : ability.targets;
}

export function getAbilityResourceCosts(ability: AbilityStatic): ResourceCost[] {
    if (ability.resourceCosts && ability.resourceCosts.length > 0) return ability.resourceCosts;
    if (ability.resourceCost) return [ability.resourceCost];
    return [];
}
