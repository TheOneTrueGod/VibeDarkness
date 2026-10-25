/**
 * TerrainStrike — reusable CastBehaviour that damages or consumes rock at a point or over a set of
 * tiles. It is the terrain half of an attack: pair it with a damage behaviour (MeleeAttack, Pulse,
 * Instant) in the same timing window and the strike and the hit share one footprint.
 *
 * Two effects, chosen with a fluent call:
 *  - `damageRock(amount?)`: every intact rock tile in the area takes `amount` durability damage
 *    (default `EARTH_CORE_STONE_DAMAGE_PER_INSTANCE`). Used by Shaking Ground (the tile under the
 *    caster) and Gather Stone (a tile patch).
 *  - `consumeRock(radiusTiles)`: destroys the single intact rock nearest the area's first tile
 *    within `radiusTiles` (`TerrainManager.consumeRockInRadius`). Used by Shatter.
 *
 * The area comes from `atPoint(resolver)` (the tile containing the point) or `atTiles(resolver)`
 * (an explicit tile list, e.g. `TileAreaHitboxSpec.resolveCells`). With neither, it is the tile at
 * the cast's target point, falling back to the tile under the caster.
 *
 * Stateless: it fires on the first tick of its window (`at('start')`, default) or the last tick
 * (`at('end')`), so it behaves identically in preview and committed runs.
 *
 * `strikeTerrain` is the same logic as a plain function, for hooks that are not a behaviour (for
 * example `DashBehaviour.withOnPathTile`).
 *
 * Usage:
 *   behaviour: terrainStrike().atPoint((ctx) => ctx.caster).damageRock()   // CastBehaviours.TerrainStrike() once indexed
 */

import type { Unit } from '../../game/units/Unit';
import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import { resolveTargetToPoint } from '../targeting';
import type { TileCoord } from '../tileAreaHelpers';

export type TerrainStrikeEffect =
    | {
        kind: 'damageRock';
        /** Durability damage per intact rock tile. Omit for the shared Earth Core default. */
        amount?: number;
    }
    | {
        kind: 'consumeRock';
        /** Tile radius around the area's first tile to search for the rock to destroy. */
        radiusTiles: number;
    };

/**
 * Applies `effect` to `tiles` and returns the tiles whose rock was actually struck: intact rock that
 * took damage (`damageRock`), or the one tile destroyed (`consumeRock`). Does nothing without a
 * terrain manager or tiles. `caster` is credited as the source, so Resonance and stone-damaged events
 * attribute the damage to them.
 */
export function strikeTerrain(
    engine: Pick<AbilityEngineContext, 'terrainManager'>,
    caster: Pick<Unit, 'id'>,
    tiles: readonly TileCoord[],
    effect: TerrainStrikeEffect,
): TileCoord[] {
    const tm = engine.terrainManager;
    if (!tm || tiles.length === 0) return [];

    if (effect.kind === 'consumeRock') {
        const centre = tiles[0]!;
        const destroyed = tm.consumeRockInRadius(centre.col, centre.row, effect.radiusTiles, caster.id);
        return destroyed ? [{ col: destroyed.col, row: destroyed.row }] : [];
    }

    // Pre-check intact rock: damageRock returns null unless a crack tier changes or the rock is
    // destroyed, so its return value cannot say whether a tile was struck. isIntactRockAt is false
    // out of bounds, so edge-of-map voids never count.
    const struck: TileCoord[] = [];
    for (const tile of tiles) {
        if (!tm.isIntactRockAt(tile.col, tile.row)) continue;
        tm.damageRock(tile.col, tile.row, effect.amount, caster.id);
        struck.push({ col: tile.col, row: tile.row });
    }
    return struck;
}

export class TerrainStrikeBehaviour implements CastBehaviour {
    private _resolveTiles: ((ctx: CastBehaviourTickContext) => TileCoord[]) | null = null;
    private _effect: TerrainStrikeEffect = { kind: 'damageRock' };
    private _at: 'start' | 'end' = 'start';
    private _onStruck: ((ctx: CastBehaviourTickContext, struck: TileCoord[]) => void) | null = null;

    /** Strike the tile containing the point `resolver` returns (null skips the strike). */
    atPoint(resolver: (ctx: CastBehaviourTickContext) => { x: number; y: number } | null): this {
        this._resolveTiles = (ctx) => {
            const point = resolver(ctx);
            const tm = ctx.engine.terrainManager;
            if (!point || !tm) return [];
            return [tm.grid.worldToGrid(point.x, point.y)];
        };
        return this;
    }

    /** Strike an explicit tile list. The first tile is the centre for `consumeRock`. */
    atTiles(resolver: (ctx: CastBehaviourTickContext) => readonly TileCoord[]): this {
        this._resolveTiles = (ctx) => [...resolver(ctx)];
        return this;
    }

    /** Every intact rock tile in the area takes `amount` durability damage (default: shared Earth Core damage). */
    damageRock(amount?: number): this {
        this._effect = { kind: 'damageRock', amount };
        return this;
    }

    /** Destroy the single nearest intact rock within `radiusTiles` of the area's first tile. */
    consumeRock(radiusTiles: number): this {
        this._effect = { kind: 'consumeRock', radiusTiles };
        return this;
    }

    /** `'start'` (default) strikes on the window's first tick, `'end'` on its last. */
    at(when: 'start' | 'end'): this {
        this._at = when;
        return this;
    }

    /** Called once after the strike with the tiles that were struck (skipped when none were). */
    onStruck(fn: (ctx: CastBehaviourTickContext, struck: TileCoord[]) => void): this {
        this._onStruck = fn;
        return this;
    }

    onTick(ctx: CastBehaviourTickContext): void {
        if (this._at === 'end' ? !ctx.isLastTick : !ctx.isFirstTick) return;
        const tiles = this._resolveTiles ? this._resolveTiles(ctx) : this.defaultTiles(ctx);
        const struck = strikeTerrain(ctx.engine, ctx.caster, tiles, this._effect);
        if (struck.length > 0) this._onStruck?.(ctx, struck);
    }

    /** The cast's target point, falling back to the caster's own position. */
    private defaultTiles(ctx: CastBehaviourTickContext): TileCoord[] {
        const tm = ctx.engine.terrainManager;
        if (!tm) return [];
        const point = resolveTargetToPoint(ctx.target, ctx.engine) ?? ctx.caster;
        return [tm.grid.worldToGrid(point.x, point.y)];
    }
}

/** Factory for the `CastBehaviours.TerrainStrike()` entry (the index is wired by the integrator). */
export const terrainStrike = (): TerrainStrikeBehaviour => new TerrainStrikeBehaviour();
