import type { WorldModifierDef } from './types';

/**
 * VisualEffect — forward-compatible stub for the parallel VisualEffect definition system.
 * Replace with the real import once that system is merged into the repo.
 *
 * VisualEffect: wire to VisualEffect runtime when available.
 */
export interface VisualEffectDef {
    id: string;
    params?: Record<string, unknown>;
}

/**
 * Declarative effect variants for world modifier rules.
 * Every variant carries an optional `visualEffects` array as a hook for the
 * VisualEffect system (currently a no-op stub — see WorldModifierRuntime).
 */
export type WorldEffect =
    | SpawnLightSourceEffect
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
