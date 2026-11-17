import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import type { TerrainLayerName } from '../../game/TerrainLayerManager';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getDirectionFromTo, getPixelTargetPosition } from '../targetHelpers';
import { worldToTile, type TileCoord } from '../tileAreaHelpers';

type Resolvable<T> = T | ((ctx: CastBehaviourTickContext) => T);

export interface GroundTrailConfig {
    /** Terrain-effect type laid on every tile of the trail (e.g. `'dark_thorn'`). */
    effectType: string;
    /** Terrain layer (default `'ground'`). */
    layer?: TerrainLayerName;
    /**
     * Tiles in the trail. A function so a cast can roll its length: draw it from `ctx.engine.generateRandomInteger`
     * (called once per cast, on the first tick, so every client and preview draws the same value).
     */
    tiles: Resolvable<number>;
    /** Trail start (default: the caster's position at the first tick). */
    origin?: (ctx: CastBehaviourTickContext) => { x: number; y: number };
    /** Heading (default: from the origin toward the window's pixel target). */
    direction?: (ctx: CastBehaviourTickContext) => { x: number; y: number } | null;
    /** Guaranteed lifetime of every laid tile, in seconds from the moment it is laid. */
    lifetimeSec: Resolvable<number>;
    /** Effect params stored on every tile. */
    params?: Resolvable<Record<string, unknown>>;
    /** Id prefix stem; `${idPrefix}-${caster.id}-${gameTime}` plus tile coords is used. */
    idPrefix: string;
    /** Called when the head reaches a new tile (index 0 is the first tile), for visuals. Render-only side effects. */
    onTile?: (ctx: CastBehaviourTickContext, tile: TileCoord, index: number) => void;
    /** Called once, the tick the trail has been fully laid (the head "retracts" from here). */
    onComplete?: (ctx: CastBehaviourTickContext, tiles: readonly TileCoord[]) => void;
}

interface GroundTrailPayload {
    /** Tiles the trail is made of, in order from the origin outward (computed once, on the first tick). */
    tiles: TileCoord[];
    /** How many tiles are already laid. */
    laid: number;
}

function resolve<T>(value: Resolvable<T>, ctx: CastBehaviourTickContext): T {
    return typeof value === 'function' ? (value as (c: CastBehaviourTickContext) => T)(ctx) : value;
}

/** Tiles a head walking from `origin` along the unit vector (dirX, dirY) enters, one per tile of travel, no repeats. */
export function trailTiles(origin: { x: number; y: number }, dirX: number, dirY: number, count: number): TileCoord[] {
    const out: TileCoord[] = [];
    const seen = new Set<string>();
    // Sample at half-tile steps so a diagonal heading never skips a tile; stop once `count` distinct tiles are found.
    for (let step = 1; out.length < count && step <= count * 4 + 4; step++) {
        const d = (step * CELL_SIZE) / 2;
        const tile = worldToTile(origin.x + dirX * d, origin.y + dirY * d);
        const key = `${tile.col},${tile.row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tile);
    }
    return out;
}

/**
 * A runner: over its window a head grows from the origin along a heading and lays a ground effect on each tile it
 * reaches (the Creeper's thorn trail). The trail's length is rolled once per cast, the tiles are laid in order as the
 * window progresses (the last one is guaranteed by the window's last tick), and each tile lives for `lifetimeSec` from
 * the moment it is laid. Pure placement plus the `onTile` / `onComplete` hooks for visuals; it never moves the caster.
 *
 * Reusable for fire trails, slime trails or frost runners: swap `effectType`, `params` and `tiles`. State (the tile list
 * and how many are laid) lives in the behaviour payload, so a snapshot mid-trail resumes identically.
 */
export class GroundTrailBehaviour implements CastBehaviour {
    constructor(private readonly config: GroundTrailConfig) {}

    onTick(ctx: CastBehaviourTickContext): void {
        const eng = ctx.engine;
        if (!eng.terrainLayers) return;
        let payload = ctx.behaviourPayload as GroundTrailPayload | undefined;
        if (!payload) {
            payload = this.start(ctx);
            if (!payload) return;
        }
        const total = payload.tiles.length;
        const due = ctx.isLastTick ? total : Math.min(total, Math.floor(ctx.windowProgress * total + 1e-6) + 1);
        const { config } = this;
        for (let index = payload.laid; index < due; index++) {
            const tile = payload.tiles[index]!;
            eng.terrainLayers.add({
                id: `${config.idPrefix}-${ctx.caster.id}-${eng.gameTime}-${tile.col}-${tile.row}`,
                layer: config.layer ?? 'ground',
                effectType: config.effectType,
                placedAtGameTime: eng.gameTime,
                expiresAtGameTime: eng.gameTime + resolve(config.lifetimeSec, ctx),
                ownerUnitId: ctx.caster.id,
                ownerAbilityId: ctx.abilityId,
                teamId: ctx.caster.teamId,
                area: { type: 'cell', col: tile.col, row: tile.row },
                params: config.params ? resolve(config.params, ctx) : {},
            });
            config.onTile?.(ctx, tile, index);
        }
        if (due > payload.laid) {
            payload.laid = due;
            if (due >= total) config.onComplete?.(ctx, payload.tiles);
        }
        ctx.setBehaviourPayload(payload);
    }

    private start(ctx: CastBehaviourTickContext): GroundTrailPayload | undefined {
        const { config } = this;
        const origin = config.origin?.(ctx) ?? { x: ctx.caster.x, y: ctx.caster.y };
        let dir = config.direction?.(ctx) ?? null;
        if (!dir) {
            const aim = getPixelTargetPosition(ctx.allTargets, 0);
            if (!aim) return undefined;
            const d = getDirectionFromTo(origin.x, origin.y, aim.x, aim.y);
            dir = { x: d.dirX, y: d.dirY };
        }
        const count = Math.max(0, Math.round(resolve(config.tiles, ctx)));
        return { tiles: trailTiles(origin, dir.x, dir.y, count), laid: 0 };
    }
}

export function GroundTrail(config: GroundTrailConfig): GroundTrailBehaviour {
    return new GroundTrailBehaviour(config);
}
