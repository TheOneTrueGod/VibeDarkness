import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import type { TerrainLayerName } from '../../game/TerrainLayerManager';
import { placeJitteredGroundThorns } from '../targetHelpers';

type Resolvable<T> = T | ((ctx: CastBehaviourTickContext) => T);

export interface GroundPatchConfig {
    /** Terrain-effect type placed in every cell (e.g. `'dark_thorn'`). */
    effectType: string;
    /** Terrain layer (default `'ground'`). */
    layer?: TerrainLayerName;
    /** Patch centre (default: the caster's position at fire time). */
    center?: (ctx: CastBehaviourTickContext) => { x: number; y: number };
    /** Patch radius in px; a function so it can react to caster state (e.g. weakened by light). */
    radius: Resolvable<number>;
    /** Guaranteed lifetime of every cell, in seconds from placement. */
    lifetimeSec: Resolvable<number>;
    /** Seconds shaved off the end of the lifetime (so a patch clears just before the next cast). Applied after the add, to keep float results exact. */
    lifetimeTrimSec?: number;
    /** Extra random lifetime per cell in `[0, jitterSec]`, longer toward the centre so the patch thins from the edge. */
    jitterSec: number;
    /** Effect params stored on every cell (e.g. `{ slowMult }`). */
    params: Resolvable<Record<string, unknown>>;
    /** Unique-per-placement id prefix stem; `${idPrefix}-${caster.id}-${gameTime}` plus cell coords is used. */
    idPrefix: string;
    /** Owner ability id recorded on the cells (default: the casting ability). */
    ownerAbilityId?: string;
}

function resolve<T>(value: Resolvable<T>, ctx: CastBehaviourTickContext): T {
    return typeof value === 'function' ? (value as (c: CastBehaviourTickContext) => T)(ctx) : value;
}

/**
 * Places a lasting ground-effect patch (a jittered fill of terrain-effect cells) when its timing
 * window is entered. Uses `engine.generateRandomInteger`, so the patch is identical on host,
 * clients and previews. Pure placement: the blast that usually accompanies it (damage, knockback,
 * VFX) is a separate behaviour in the same window, kept ahead of this one in the array.
 *
 * Reusable for thorns (Thorn Stomp, Bramble Patch), fire, frost or slime patches: swap
 * `effectType`, `params` and `layer`.
 *
 * Usage:
 *   behaviour: new GroundPatchBehaviour({ effectType: 'dark_thorn', radius: 95, lifetimeSec: 30, ... })
 */
export class GroundPatchBehaviour implements CastBehaviour {
    constructor(private readonly config: GroundPatchConfig) {}

    onTick(ctx: CastBehaviourTickContext): void {
        if (!ctx.isFirstTick) return;
        const { config } = this;
        const eng = ctx.engine;
        if (!eng.terrainLayers) return;
        const center = config.center?.(ctx) ?? { x: ctx.caster.x, y: ctx.caster.y };
        placeJitteredGroundThorns({
            engine: eng as typeof eng & { terrainLayers: NonNullable<typeof eng.terrainLayers> },
            caster: ctx.caster,
            center,
            radius: resolve(config.radius, ctx),
            layer: config.layer,
            effectType: config.effectType,
            placedAtGameTime: eng.gameTime,
            baseExpiresAtGameTime: eng.gameTime + resolve(config.lifetimeSec, ctx) - (config.lifetimeTrimSec ?? 0),
            durationJitterInSeconds: config.jitterSec,
            ownerAbilityId: config.ownerAbilityId ?? ctx.abilityId,
            params: resolve(config.params, ctx),
            idPrefix: `${config.idPrefix}-${ctx.caster.id}-${eng.gameTime}`,
        });
    }
}

export function GroundPatch(config: GroundPatchConfig): GroundPatchBehaviour {
    return new GroundPatchBehaviour(config);
}
