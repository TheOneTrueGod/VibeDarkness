/**
 * Ability - Static base class for all abilities.
 *
 * Abilities are defined as static classes so that we can reference them
 * by ID (stored on the server) and look them up in the AbilityRegistry.
 * Each ability class holds all its properties as statics.
 */

import type { TargetDef } from './targeting';
import type { ResolvedTarget } from '../engine/types';
import type { ActiveAbility } from '../engine/types';
import type { Unit } from '../objects/Unit';
import type { AbilityTiming } from './abilityTimings';
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
    /** Time in seconds for the ability's cooldown. */
    readonly cooldownTime: number;
    /** Resource cost to use the ability. Null means free. */
    readonly resourceCost: ResourceCost | null;
    /** Rounds the card spends in exile before returning to deck. */
    readonly rechargeTurns: number;
    /** Ordered list of targets the player must select. */
    readonly targets: TargetDef[];
    /** Optional ability keywords that alter card lifecycle behavior. */
    readonly keywords?: Partial<{ [K in AbilityKeyword]: AbilityKeywordDefs[K] }>;
    /**
     * Optional target resolver. If omitted, callers should use `ability.targets`.
     * Use when target count/labels depend on runtime state (e.g. research).
     */
    getTargets?(caster?: Unit, gameState?: unknown): TargetDef[];
    /** AI settings controlling when this ability is used (range check). */
    readonly aiSettings?: AbilityAISettings;
    /**
     * Time in seconds before the ability's main effect fires.
     * The engine calls doCardEffect every tick while the ability is active.
     * Use 0 for instant abilities.
     */
    readonly prefireTime: number;

    /**
     * Optional. Segments for the circular progress indicator (windup / active / cooldown etc.).
     * If present, the ring is drawn in segments by phase; otherwise a single color is used.
     */
    readonly abilityTimings?: AbilityTiming[];

    /**
     * Get tooltip lines for the card UI. Use {value} in a line for dynamic parts
     * (e.g. "Hit {1} enemy for {8} damage"). Dynamic segments are rendered in a distinct colour.
     */
    getTooltipText(gameState?: unknown): string[];

    /**
     * Execute the ability's effect over time using threshold checks.
     *
     * Called every tick while the ability is active. `prevTime` and `currentTime`
     * are seconds elapsed since the ability started. The ability should check
     * thresholds (e.g. `prevTime < 0.3 && currentTime >= 0.3`) to fire one-shot
     * effects, and guard with `currentTime < prefireTime` (or similar) for
     * per-tick effects. The ability is removed once `currentTime >= prefireTime`
     * and getAbilityStates returns empty.
     *
     * On the first tick, prevTime is 0.
     */
    doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: import('../engine/types').ActiveAbility,
    ): void;

    /**
     * Return a list of active ability states at the given elapsed time.
     * Used by the engine to apply effects like movement penalties.
     * The active ability stays alive until both prefireTime is reached
     * and this returns an empty array.
     */
    getAbilityStates(currentTime: number): AbilityStateEntry[];

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
    if (!ability.resourceCost) return true;
    const resource = unit.getResource(ability.resourceCost.resourceId);
    if (!resource) return false;
    return resource.canAfford(ability.resourceCost.amount);
}

/**
 * Spend the resource cost for an ability. Returns false if cannot afford.
 */
export function spendAbilityCost(unit: Unit, ability: AbilityStatic): boolean {
    if (!ability.resourceCost) return true;
    const resource = unit.getResource(ability.resourceCost.resourceId);
    if (!resource) return false;
    return resource.spend(ability.resourceCost.amount);
}

/**
 * Refund the resource cost for an ability (e.g. when the ability is interrupted).
 */
export function refundAbilityCost(unit: Unit, ability: AbilityStatic): void {
    if (!ability.resourceCost) return;
    const resource = unit.getResource(ability.resourceCost.resourceId);
    if (resource) resource.add(ability.resourceCost.amount);
}

/** Resolve runtime targets for an ability (dynamic if provided, otherwise static). */
export function getAbilityTargets(ability: AbilityStatic, caster?: Unit, gameState?: unknown): TargetDef[] {
    return ability.getTargets ? ability.getTargets(caster, gameState) : ability.targets;
}
