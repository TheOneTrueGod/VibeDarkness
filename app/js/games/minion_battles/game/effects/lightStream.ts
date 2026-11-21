/**
 * Light stream: a render-only stream of motes flowing from a drained light to the unit drinking it.
 * Used by `CastBehaviours.DrainLight`. Painted in `effect_defs/lightStreamEffects.ts`.
 * The effect sits at the light; `effectData` holds the caster end (`toX`, `toY`) and the colour.
 */
export const LIGHT_STREAM_EFFECT_TYPE = 'LightStream';

export interface LightStreamEffectData extends Record<string, unknown> {
    toX: number;
    toY: number;
    color: number;
}
