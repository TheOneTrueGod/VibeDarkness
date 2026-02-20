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

/** Minimal graphics interface for drawing active-ability previews (Pixi Graphics–compatible). */
export interface IAbilityPreviewGraphics {
    clear(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
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
    /** AI settings controlling when this ability is used (range check). */
    readonly aiSettings?: AbilityAISettings;
    /**
     * Time in seconds before the ability's main effect fires.
     * The engine calls doCardEffect every tick while the ability is active.
     * Use 0 for instant abilities.
     */
    readonly prefireTime: number;

    /**
     * Get the ability description, potentially varying with game state.
     */
    getDescription(gameState?: unknown): string;

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
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void;

    /**
     * Return a list of active ability states at the given elapsed time.
     * Used by the engine to apply effects like movement penalties.
     * The active ability stays alive until both prefireTime is reached
     * and this returns an empty array.
     */
    getAbilityStates(currentTime: number): AbilityStateEntry[];

    /**
     * Render a targeting preview on the canvas.
     * Called each frame while the player is choosing targets.
     */
    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void;

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
