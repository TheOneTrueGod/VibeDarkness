/**
 * Shared death VFX helpers for Darkness-spawned creatures.
 * Small dark creatures use the icon flash (`darkCreatureIconFlashVFX`).
 * Larger creatures use the particle burst (`darkCreatureParticleBurstVFX`).
 * Unit defs reference these helpers via `onDeathVisualEffects`.
 */

import type { VisualEffectDef } from '../effects/visualEffectDef';

/** Purple puff dissolution — particle count scales visual intensity. */
export const darkCreatureParticleBurstVFX = (count: number): VisualEffectDef[] =>
    [{ type: 'particleRing', imageKey: 'darkBlob', count }];

/** Short icon flash + upward particle drift for small dark creatures. */
export const darkCreatureIconFlashVFX = (particleCount: number): VisualEffectDef[] =>
    [{ type: 'darkCreatureIconFlash', particleCount }];
