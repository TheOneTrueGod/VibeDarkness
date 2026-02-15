/**
 * Ability - Static base class for all abilities.
 *
 * Abilities are defined as static classes so that we can reference them
 * by ID (stored on the server) and look them up in the AbilityRegistry.
 * Each ability class holds all its properties as statics.
 */

import type { TargetDef } from './targeting';
import type { ResolvedTarget } from '../engine/types';
import type { Unit } from '../objects/Unit';

/** Resource cost for using an ability. */
export interface ResourceCost {
    resourceId: string;
    amount: number;
}

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
     * Get the ability description, potentially varying with game state.
     */
    getDescription(gameState?: unknown): string;

    /**
     * Execute the ability's effect in the game engine.
     * Called when the card is played and all targets are resolved.
     */
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[]): void;

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
