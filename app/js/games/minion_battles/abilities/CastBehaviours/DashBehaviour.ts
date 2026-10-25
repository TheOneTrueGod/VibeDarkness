/**
 * DashBehaviour — movement CastBehaviour for dash/dodge abilities.
 *
 * Moves the caster toward a pixel target over the full timing window, terrain-aware.
 * Optional afterimage trail: spawned here (not via emitterDef) because the trail
 * velocity is perpendicular to the dash direction, requiring runtime direction data.
 *
 * Optional hitbox via addHitbox(): caster-anchored touch detection that deals damage
 * and fires ON_ATTACK_HIT events per hit unit (enabling abilityEvents side-effects such
 * as knockback). Uses touch semantics: a unit is hit when the two circles overlap.
 *
 * Optional extensions (all off by default, so existing dashes are unchanged):
 *  - withPassThroughTerrain(): the dash ignores terrain collision (wall-penetrating dashes).
 *  - withOnPathTile(cb): called once per tile the caster's centre enters along the path, so an
 *    ability can react to the ground it crosses (damage rock with `strikeTerrain`, leave a trail).
 *  - withConstantSpeed(): covers `maxDistance` over the window, so a short dash arrives early and
 *    waits instead of slowing down to fill the window.
 *  - addHitbox(..., { maxTargets }): cap on the distinct units one dash may hit.
 */

import type { Unit } from '../../game/units/Unit';
import { FIXED_DT } from '../../game/gameConstants';
import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { getDirectionFromTo } from '../targetHelpers';
import { computeForcedDisplacement } from '../../game/forceMove';
import { getBodyColorForUnit, getCharacterSpriteKey } from '../../game/units/unit_defs/unitDef';
import { Effect } from '../../game/effects/Effect';
import type { HitboxDef } from '../hitboxDef';
import { tryDamageOrBlock } from '../blockingHelpers';
import { areEnemies } from '../../game/teams';
import { worldToTile, type TileCoord } from '../tileAreaHelpers';

const AFTERIMAGE_DURATION = 6 / 60;
const AFTERIMAGE_INITIAL_ALPHA = 0.75;

interface DashHitboxConfig {
    def: HitboxDef;
    damage: number | ((ctx: CastBehaviourTickContext) => number);
    attackType: 'melee' | 'charging';
    filter: 'enemy' | 'ally' | 'any';
    /** Cap on distinct units hit across the whole dash; null = unlimited. */
    maxTargets: number | null;
}

interface DashPayload {
    endX: number;
    endY: number;
    totalDistance: number;
    // Afterimage state — null when afterimages are disabled.
    afterimage: {
        bodyColor: number;
        radius: number;
        characterSpriteKey?: string;
        perpX: number; // unit vector perpendicular to dash direction
        perpY: number;
        tickCount: number;
    } | null;
    // Hit-dedup set — null when no hitbox is configured.
    hitIds: Set<string> | null;
    // Tiles already reported to the path-tile hook, as `col,row` keys (an array, not a Set, so the
    // payload stays JSON-friendly). Stays empty when no hook is configured.
    visitedTiles: string[];
    // When stopAfterHits is set, set to true once that many units have been hit so
    // subsequent ticks skip movement.
    stopped: boolean;
}

export class DashBehaviour implements CastBehaviour {
    private _maxDistance: number = 140;
    private _collisionStep: number = 4;
    private _afterimagesEnabled: boolean = false;
    private _afterimageEveryNTicks: number = 2;
    private _hitbox: DashHitboxConfig | null = null;
    /** Stop dash movement after this many successful hits; null = never stop on hit. */
    private _stopAfterHits: number | null = null;
    private _onHitCallback: ((hitUnit: Unit, ctx: CastBehaviourTickContext) => void) | null = null;
    /** When true the dash ignores terrain collision (see {@link withPassThroughTerrain}). */
    private _passThroughTerrain: boolean = false;
    /** When true the dash covers `maxDistance` over the window instead of the clamped distance. */
    private _constantSpeed: boolean = false;
    private _onPathTile: ((ctx: CastBehaviourTickContext, tile: TileCoord) => void) | null = null;
    withMaxDistance(px: number): this {
        this._maxDistance = px;
        return this;
    }

    withCollisionStep(px: number): this {
        this._collisionStep = px;
        return this;
    }

    /** Spawn an afterimage trail during the dash. everyNTicks controls emission rate (default 2 = 15 Hz at 30 Hz physics). */
    withAfterimages(enabled = true, everyNTicks = 2): this {
        this._afterimagesEnabled = enabled;
        this._afterimageEveryNTicks = everyNTicks;
        return this;
    }

    /** Optional callback fired once per hit unit during `_processHitbox`. Runs after the hit is confirmed. */
    withOnHit(cb: (hitUnit: Unit, ctx: CastBehaviourTickContext) => void): this {
        this._onHitCallback = cb;
        return this;
    }

    /**
     * Ignore terrain collision: the dash travels the full distance through walls, rock and other
     * impassable tiles (Digging Claws). Pair with {@link withOnPathTile} to react to what is crossed.
     * The ability is responsible for the caster not being left inside a wall (see the wall-unstick
     * system and `conditionalCancel`).
     */
    withPassThroughTerrain(enabled = true): this {
        this._passThroughTerrain = enabled;
        return this;
    }

    /**
     * Path-hit hook: called once for each tile the caster's centre enters during the dash, after the
     * tick's movement, in path order. A tile is reported once per dash. The tile is reported whatever
     * its terrain, so the callback decides what counts (for example `strikeTerrain` only affects
     * intact rock).
     */
    withOnPathTile(cb: (ctx: CastBehaviourTickContext, tile: TileCoord) => void): this {
        this._onPathTile = cb;
        return this;
    }

    /**
     * Move at the fixed speed `maxDistance / windowLength` rather than spreading the (possibly
     * shorter) clamped distance over the whole window. A dash aimed closer than `maxDistance`
     * arrives early and then waits out the window, instead of crawling to fill it.
     */
    withConstantSpeed(enabled = true): this {
        this._constantSpeed = enabled;
        return this;
    }

    /**
     * Stop dash movement after the touch hitbox registers its Nth successful hit.
     * The timing window continues to run (for afterimages, effects, etc.) but
     * no further displacement is applied. Existing dashes without this are unaffected.
     */
    withStopAfterHits(count: number): this {
        this._stopAfterHits = count;
        return this;
    }

    /** Shorthand for {@link withStopAfterHits}(1). */
    withStopOnHit(enabled = true): this {
        this._stopAfterHits = enabled ? 1 : null;
        return this;
    }

    /**
     * Add a caster-anchored hitbox that deals damage to units the caster touches during the dash.
     * anchor must be 'caster' (only supported value). def describes the shape; for circle with
     * range 'caster', the radius equals caster.radius at call time. Hit semantics: dist <= hitRadius + unit.radius.
     * Fires ON_ATTACK_HIT via tryDamageOrBlock, allowing abilityEvents rules to handle side-effects.
     */
    addHitbox(
        _anchor: 'caster',
        def: HitboxDef,
        attack: {
            damage: number | ((ctx: CastBehaviourTickContext) => number);
            attackType: 'melee' | 'charging';
            filter?: 'enemy' | 'ally' | 'any';
            /** Cap on distinct units hit across the whole dash; the nearest are hit first when more touch at once. */
            maxTargets?: number;
        },
    ): this {
        this._hitbox = {
            def,
            damage: attack.damage,
            attackType: attack.attackType,
            filter: attack.filter ?? 'enemy',
            maxTargets: attack.maxTargets ?? null,
        };
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const target = ctx.target;
        if (target.type !== 'pixel' || !target.position) {
            ctx.setBehaviourPayload({ endX: ctx.caster.x, endY: ctx.caster.y, totalDistance: 0, afterimage: null, hitIds: null, visitedTiles: [], stopped: false });
            return;
        }

        const { x: targetX, y: targetY } = target.position;
        const { dirX, dirY } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, targetX, targetY);

        const { dx, dy, distance: totalDistance } = computeForcedDisplacement(
            ctx.caster.x, ctx.caster.y,
            targetX, targetY,
            this._maxDistance,
            { terrainManager: this._passThroughTerrain ? null : (ctx.engine.terrainManager ?? null), step: this._collisionStep },
        );
        const endX = ctx.caster.x + dx;
        const endY = ctx.caster.y + dy;

        let afterimage: DashPayload['afterimage'] = null;
        if (this._afterimagesEnabled) {
            afterimage = {
                bodyColor: getBodyColorForUnit(ctx.caster),
                radius: ctx.caster.radius,
                characterSpriteKey: getCharacterSpriteKey(ctx.caster.characterId),
                perpX: -dirY, // 90° counterclockwise
                perpY: dirX,
                tickCount: 0,
            };
        }

        ctx.setBehaviourPayload({
            endX,
            endY,
            totalDistance,
            afterimage,
            hitIds: this._hitbox ? new Set<string>() : null,
            visitedTiles: [],
            stopped: false,
        } satisfies DashPayload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as DashPayload | null;
        if (!payload || payload.totalDistance <= 0) return;

        const distToEnd = Math.hypot(payload.endX - ctx.caster.x, payload.endY - ctx.caster.y);
        const stillDashing = !payload.stopped && distToEnd > 0;
        // Ghost through CrowdSpacing only while the dash is still displacing.
        if (stillDashing) {
            ctx.caster.claimAbilityMovement();
            const progressDelta = ctx.windowProgress - ctx.prevWindowProgress;
            const span = this._constantSpeed ? this._maxDistance : payload.totalDistance;
            const moveThisTick = Math.min(progressDelta * span, distToEnd);
            if (moveThisTick > 0) {
                ctx.caster.invalidateMovementPath();
                ctx.caster.moveUnit(payload.endX, payload.endY, moveThisTick);
                if (this._onPathTile !== null) this._reportPathTile(ctx, payload);
            }
        }

        if (payload.afterimage) {
            // tickCount counts local ticks (FIXED_DT of the caster's local time), so the trail spacing follows tempo.
            // At pace 1 localDt === FIXED_DT, so this is the old integer count and every Nth tick spawns.
            const prevTicks = payload.afterimage.tickCount;
            payload.afterimage.tickCount += (ctx.localDt ?? FIXED_DT) / FIXED_DT;
            if (Math.floor(payload.afterimage.tickCount / this._afterimageEveryNTicks) > Math.floor(prevTicks / this._afterimageEveryNTicks)) {
                this._spawnAfterimage(ctx, payload.afterimage);
            }
            ctx.setBehaviourPayload(payload);
        }

        // Hitbox check runs after movement so hit detection uses the caster's new position.
        if (this._hitbox !== null && payload.hitIds !== null) {
            this._processHitbox(ctx, payload);
        }
    }

    /** Reports the tile the caster now stands in to the path hook, once per tile per dash. */
    private _reportPathTile(ctx: CastBehaviourTickContext, payload: DashPayload): void {
        const tile = worldToTile(ctx.caster.x, ctx.caster.y);
        const key = `${tile.col},${tile.row}`;
        if (payload.visitedTiles.includes(key)) return;
        payload.visitedTiles.push(key);
        ctx.setBehaviourPayload(payload);
        this._onPathTile!(ctx, tile);
    }

    private _processHitbox(ctx: CastBehaviourTickContext, payload: DashPayload): void {
        const { def, damage: damageOrFn, attackType, filter, maxTargets } = this._hitbox!;
        const hitRadius = def.shape === 'circle'
            ? (def.range === 'caster' ? ctx.caster.radius : def.range)
            : ctx.caster.radius;

        const candidates: Unit[] = [];
        for (const unit of ctx.engine.units) {
            if (!unit.active || !unit.isAlive()) continue;
            if (unit.id === ctx.caster.id) continue;
            if (filter === 'enemy' && !areEnemies(ctx.caster.teamId, unit.teamId)) continue;
            if (filter === 'ally' && areEnemies(ctx.caster.teamId, unit.teamId)) continue;
            if (payload.hitIds!.has(unit.id)) continue;
            if (unit.hasIFrames(ctx.engine.gameTime)) continue;

            const dist = Math.hypot(unit.x - ctx.caster.x, unit.y - ctx.caster.y);
            if (dist > hitRadius + unit.radius) continue;
            candidates.push(unit);
        }

        // Respect the dash-wide cap: when more units touch than slots remain, the nearest are hit first.
        const slotsRemaining = maxTargets !== null ? maxTargets - payload.hitIds!.size : Infinity;
        const toHit = candidates.length > slotsRemaining
            ? candidates
                .map((unit) => ({ unit, distSq: (unit.x - ctx.caster.x) ** 2 + (unit.y - ctx.caster.y) ** 2 }))
                .sort((a, b) => a.distSq - b.distSq)
                .slice(0, Math.max(0, slotsRemaining))
                .map((entry) => entry.unit)
            : candidates;

        for (const unit of toHit) {
            const damage = typeof damageOrFn === 'function' ? damageOrFn(ctx) : damageOrFn;
            const outcome = tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: ctx.caster.x,
                attackerY: ctx.caster.y,
                attackerId: ctx.caster.id,
                abilityId: ctx.abilityId,
                damage,
                attackType,
            });
            if (outcome.hit) {
                payload.hitIds!.add(unit.id);
                if (this._stopAfterHits !== null && payload.hitIds!.size >= this._stopAfterHits) {
                    payload.stopped = true;
                }
                this._onHitCallback?.(unit, ctx);
            }
        }
        ctx.setBehaviourPayload(payload);
    }

    private _spawnAfterimage(ctx: CastBehaviourTickContext, ai: NonNullable<DashPayload['afterimage']>): void {
        // cosmetic-only: afterimage drift is visual, not part of synced state
        // eslint-disable-next-line no-restricted-syntax
        const speed = (Math.random() - 0.5) * 50;
        const eng = ctx.engine as { addEffect(e: Effect): void };
        eng.addEffect(new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: AFTERIMAGE_DURATION,
            // Hold the trail snapshot at a pause plane instead of letting it fade to nothing.
            pauseBehaviour: 'hold',
            effectType: 'Afterimage',
            effectData: {
                bodyColor: ai.bodyColor,
                radius: ai.radius,
                characterSpriteKey: ai.characterSpriteKey,
                initialAlpha: AFTERIMAGE_INITIAL_ALPHA,
                vx: ai.perpX * speed,
                vy: ai.perpY * speed,
            },
        }));
    }
}
