import type { WorldModifierDef } from './types';
import type { OverlapMethod } from '../game/LightGrid';
import type { VisualEffectDef } from '../game/effects/visualEffectDef';
import type { SpawnBehaviour } from '../storylines/types';
import type { TeamId } from '../game/teams';

export type { VisualEffectDef };

/**
 * Declarative effect variants for world modifier rules.
 * Every variant carries an optional `visualEffects` array as a hook for the
 * VisualEffect system (currently a no-op stub — see WorldModifierRuntime).
 */
export type WorldEffect =
    | SpawnLightSourceEffect
    | SpawnUnitsEffect
    | IncrementCounterEffect
    | AddWorldModifierEffect
    | RemoveWorldModifierEffect
    | SetWorldModifierDisabledEffect
    | CustomWorldEffect;

export interface SpawnLightSourceEffect {
    type: 'spawnLightSource';
    lightAmount: number;
    radius: number;
    durationRounds: number;
    /** World position source. 'victim' = dying unit; 'killer' = attacking unit. */
    position: 'victim' | 'killer';
    /** Optional tint color (hex number). */
    color?: number;
    /** How this source combines with other light sources on the same tile. Defaults to 'max'. */
    overlapMethod?: OverlapMethod;
    /** If true, skip linear fade — source holds full emission/radius until duration expires. */
    noDecay?: boolean;
    /** VisualEffect: wire to VisualEffect runtime when available. */
    visualEffects?: VisualEffectDef[];
}

/**
 * Spawn one or more units via the shared `spawnUnit` path (placement + bake).
 * Typical use: DarknessStrength `spawnTweak` compiled to `on_round_start` rules.
 */
export interface SpawnUnitsEffect {
    type: 'spawnUnits';
    characterId: string;
    count: number;
    /** Defaults to `edgeOfMap`. */
    spawnBehaviour?: SpawnBehaviour;
    /** Only with `spawnBehaviour: 'anywhere'` — restrict to full-darkness tiles. */
    inDarkness?: boolean;
    /** Defaults to `'enemy'`. */
    teamId?: TeamId;
    /** VisualEffect: wire to VisualEffect runtime when available. */
    visualEffects?: VisualEffectDef[];
}

export interface IncrementCounterEffect {
    type: 'incrementCounter';
    counterId: string;
    /** Amount to add; defaults to 1. */
    amount?: number;
    /** VisualEffect: wire to VisualEffect runtime when available. */
    visualEffects?: VisualEffectDef[];
}

export interface AddWorldModifierEffect {
    type: 'addWorldModifier';
    modifierDef: WorldModifierDef;
    /** VisualEffect: wire to VisualEffect runtime when available. */
    visualEffects?: VisualEffectDef[];
}

export interface RemoveWorldModifierEffect {
    type: 'removeWorldModifier';
    modifierId: string;
    /** VisualEffect: wire to VisualEffect runtime when available. */
    visualEffects?: VisualEffectDef[];
}

export interface SetWorldModifierDisabledEffect {
    type: 'setWorldModifierDisabled';
    modifierId: string;
    disabled: boolean;
    /** VisualEffect: wire to VisualEffect runtime when available. */
    visualEffects?: VisualEffectDef[];
}

/**
 * Escape hatch for effects needing bespoke runtime logic.
 * Primary use: built-in migration of legacy GameEngine death handlers.
 * `comment` is required so intent is clear in data-first modifier definitions.
 */
export interface CustomWorldEffect {
    type: 'custom';
    effectId: string;
    comment: string;
    params?: Record<string, unknown>;
    /** VisualEffect: wire to VisualEffect runtime when available. */
    visualEffects?: VisualEffectDef[];
}
