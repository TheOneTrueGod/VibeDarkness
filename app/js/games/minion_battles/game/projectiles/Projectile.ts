/**
 * Projectile - Moves in a straight line, collides with enemy units.
 *
 * Created by abilities (e.g. ThrowKnife). Travels a fixed distance,
 * dealing damage to the first enemy hit, then deactivating.
 */

import { GameObject, generateGameObjectId } from '../GameObject';
import { Effect } from '../effects/Effect';
import type { TeamId } from '../teams';
import { areEnemies } from '../teams';
import type { Unit } from '../units/Unit';
import type { EventBus } from '../EventBus';
import { canAttackBeBlocked, getBlockingArcForUnit, executeBlock } from '../../abilities/blockingHelpers';
import { getAbility } from '../../abilities/AbilityRegistry';
import { applyProjectileHitStop, applyUnitHitPause, resolveHitImpactSeconds } from '../../buffs/hitPause';
import { AbilityEventType } from '../../abilities/Ability';
import { getModifiedAbilityDamage } from '../../abilities/damageModifiers';
import { triggerAbilityEventFromAttack, triggerAbilityEventFromProjectileExpiry } from '../../abilities/events';
import {
    applyDirectionalKnockback,
    knockbackCtxFromEngine,
    resolveHitKnockbackDirection,
    type KnockbackDirectionStrategy,
} from '../../crowdControl/knockbackKeywords';
import { TERRAIN_PROPERTIES, TerrainType } from '../../terrain/TerrainType';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { ProjectileModifierId } from './ProjectileTravelModifiers';
import { isTraversableByModifiers, shouldCountTraversalDistance } from './ProjectileTravelModifiers';
import type { SpriteProjectileConfig } from './projectile_defs';
import type { VisualEffectDef } from '../effects/visualEffectDef';
import type { EngineContext } from '../EngineContext';
import { applyVisualEffectDefs } from '../effects/applyVisualEffectDefs';
import { FIXED_DT, MAX_HELD_PROJECTILE_SECONDS } from '../gameConstants';
import { resolveTempo, type TimeModifier } from '../time/TimeModifier';
import { MAX_PIECE_TRAVEL_PX, MAX_STEP_PIECES_PER_TICK } from '../time/timeConstants';
import {
    cloneProjectileBuff,
    isProjectileBuffExpired,
    type ProjectileBuff,
} from './ProjectileBuff';
import { cellsAlongSegment } from '../../abilities/tileAreaHelpers';
import { clearTerrainEffects, type TerrainClearSpec } from '../terrainEffects/terrainClearing';
import type { TerrainLayerManager } from '../TerrainLayerManager';

/** Identifies the cast that is holding a projectile before launch. */
export interface ProjectileHolder {
    unitId: string;
    abilityId: string;
}

/**
 * What happens to a projectile once it has used up its damaging hits.
 * - `stop`: deactivates on the hit that uses the last damaging hit.
 * - `passThrough`: keeps flying, no longer collides with anything, until max distance.
 * - `knockbackOnly`: keeps flying, and knocks back (no damage) every further unit it overlaps.
 */
export type ProjectileOverflowPolicy = 'stop' | 'passThrough' | 'knockbackOnly';

/** How a projectile hits: how many units take damage, what happens after, and the hit knockback. */
export interface ProjectileHitPolicy {
    /** Units that take damage before overflow applies. */
    damagingHits: number;
    overflow: ProjectileOverflowPolicy;
    /** Knockback applied to every unit the projectile hits (damaging or overflow). */
    knockback?: { tier: number; direction: KnockbackDirectionStrategy };
}

/** Legacy constructor options that `hitPolicy` replaces. See `hitPolicyFromLegacyOptions`. */
export interface LegacyProjectileHitOptions {
    /** Maps to `damagingHits = pierce + 1`. */
    pierce?: number;
    /** Maps to `overflow: 'passThrough'` (when `knockbackBeyondMaxHits` is not set). */
    continueAfterMaxHits?: boolean;
    /** Maps to `overflow: 'knockbackOnly'`. Overrides `continueAfterMaxHits`. */
    knockbackBeyondMaxHits?: boolean;
    /** Maps to `knockback.tier`. Ignored when 0 or unset (no knockback). */
    knockbackTier?: number;
    /** Maps to `knockback.direction`: 'side45' becomes `sideOfTravel` at 45 degrees; 'forward' is `travel`. */
    knockbackMode?: 'forward' | 'side45';
}

/**
 * Deprecated mapping from the old boolean/number constructor options onto a `ProjectileHitPolicy`.
 * Every existing projectile keeps its behaviour through this mapping.
 *
 * - `damagingHits` = `pierce + 1`.
 * - `overflow` = `knockbackOnly` if `knockbackBeyondMaxHits`, else `passThrough` if
 *   `continueAfterMaxHits`, else `stop`.
 * - `knockback` is set only when `knockbackTier` is truthy. The direction is `sideOfTravel` 45 for
 *   `knockbackMode: 'side45'`, and `travel` otherwise.
 */
export function hitPolicyFromLegacyOptions(options: LegacyProjectileHitOptions): ProjectileHitPolicy {
    const overflow: ProjectileOverflowPolicy = options.knockbackBeyondMaxHits
        ? 'knockbackOnly'
        : options.continueAfterMaxHits
            ? 'passThrough'
            : 'stop';
    const policy: ProjectileHitPolicy = {
        damagingHits: (options.pierce ?? 0) + 1,
        overflow,
    };
    if (options.knockbackTier) {
        policy.knockback = {
            tier: options.knockbackTier,
            direction: options.knockbackMode === 'side45'
                ? { kind: 'sideOfTravel', angleDeg: 45 }
                : { kind: 'travel' },
        };
    }
    return policy;
}

function cloneHitPolicy(policy: ProjectileHitPolicy): ProjectileHitPolicy {
    return {
        damagingHits: policy.damagingHits,
        overflow: policy.overflow,
        ...(policy.knockback
            ? { knockback: { tier: policy.knockback.tier, direction: { ...policy.knockback.direction } } }
            : {}),
    };
}

/** Ground/air effects a projectile erases from the tiles it sweeps over. */
export interface ProjectileTerrainClear {
    spec: TerrainClearSpec;
    /** Sweep half-width in px. Default: the projectile's `radius`. */
    sweepWidth?: number;
}

function cloneTerrainClear(clear: ProjectileTerrainClear): ProjectileTerrainClear {
    const { spec } = clear;
    return {
        spec: {
            layers: [...spec.layers],
            ...(spec.effectTypes ? { effectTypes: [...spec.effectTypes] } : {}),
            ...(spec.excludeEffectTypes ? { excludeEffectTypes: [...spec.excludeEffectTypes] } : {}),
            ...(spec.teams
                ? {
                    teams: {
                        ...(spec.teams.include ? { include: [...spec.teams.include] } : {}),
                        ...(spec.teams.exclude ? { exclude: [...spec.teams.exclude] } : {}),
                    },
                }
                : {}),
        },
        ...(clear.sweepWidth !== undefined ? { sweepWidth: clear.sweepWidth } : {}),
    };
}

export class Projectile extends GameObject {
    velocityX: number;
    velocityY: number;
    damage: number;
    sourceTeamId: TeamId;
    sourceUnitId: string;
    /** Ability ID that created this projectile (e.g. throw_knife, 0001). Used to call that ability's onAttackBlocked when blocked. */
    sourceAbilityId: string;
    maxDistance: number;
    distanceTraveled: number = 0;
    radius: number = 5;
    /**
     * Hit-detection shape. 'circle' (default) collides via `radius` around the current point.
     * 'rect' sweeps a rectangular slice each tick from the previous tick's position to the
     * current one, with a width interpolated between `rectStartWidth` and `rectEndWidth` by
     * travel progress (distanceTraveled / maxDistance) — e.g. Burst's growing cone wave.
     */
    hitShape: 'circle' | 'rect' = 'circle';
    /** For hitShape 'rect': perpendicular width at spawn / at max distance. */
    rectStartWidth?: number;
    rectEndWidth?: number;
    /** For hitShape 'rect': position at the start of the current tick's movement (set each update()). */
    frameStartX: number;
    frameStartY: number;
    /** Optional visual trail type (e.g. 'bullet'). When set, update() will spawn matching effects as the projectile moves. */
    trailType?: 'bullet';
    /** Projectile look variant — key into the projectile def registry. */
    projectileType: string;
    /** Optional render-only arc apex height (px), set by the launching ability's CastBehaviour. */
    arcHeight?: number;
    /** Optional render-only spin speed (degrees/sec), set by the launching ability's CastBehaviour. */
    rotationSpeed?: number;
    /** Current accumulated visual rotation (degrees), driven by `rotationSpeed` each update(). */
    rotation: number = 0;
    /** Sprite-based config for sprite_projectile type. Travels with the instance and is serialized. */
    spriteConfig?: SpriteProjectileConfig;
    /** Optional behavior modifiers (e.g. stonephase terrain traversal rules). */
    modifiers: ProjectileModifierId[];
    /**
     * Terrain types this projectile collides with and stops at (e.g. `[TerrainType.Rock]`), independent of
     * `TerrainProperties.blocksProjectiles`. Travel modifiers that traverse a type (stonephase) still win.
     * Empty = no per-type collision. Serialized.
     */
    collidesWithTerrain: TerrainType[];
    /**
     * Runtime-only: the tile and terrain that stopped this projectile (`stopsAtWalls` /
     * `collidesWithTerrain`), set just before it expires so `onProjectileExpired` can react to what it
     * hit. Null when it expired for any other reason. Not serialized (read in the same tick).
     */
    stoppedAtTerrain: { col: number; row: number; terrainType: TerrainType } | null = null;
    /** Runtime-only: visual effects fired when the projectile reaches its target. Not serialized. */
    onHitEffects?: VisualEffectDef[];

    /**
     * When true, does not collide with units; travels until max distance then expires
     * (e.g. seed pods that only spawn on landing).
     */
    passThroughEnemies: boolean;

    /**
     * Damaging hits, overflow behaviour and hit knockback. Serialized as-is. The deprecated
     * `pierce` / `continueAfterMaxHits` / `knockbackBeyondMaxHits` / `knockbackTier` /
     * `knockbackMode` constructor options map onto this (see `hitPolicyFromLegacyOptions`).
     */
    hitPolicy: ProjectileHitPolicy;

    /**
     * Unit IDs already hit this flight. Used to prevent re-hitting a unit on
     * consecutive frames while the projectile is still overlapping it.
     * Serialized (as an array) so a checkpoint restored mid-flight does not re-hit units.
     */
    readonly hitUnitIds: Set<string> = new Set();

    /**
     * Held state: set while the launching cast has not released the projectile yet. A held
     * projectile does not move, count distance, or collide. `null` once released or cancelled.
     */
    heldBy: ProjectileHolder | null;

    /**
     * Seconds spent held (counts up with game time while `heldBy` is set). Past
     * `MAX_HELD_PROJECTILE_SECONDS` the projectile is deleted with a warning as an orphan safeguard.
     */
    heldTime: number = 0;

    /**
     * Local time (seconds) this projectile has experienced. Advances by each piece's dt; flight,
     * held time and rotation run on it. Serialized only when non-zero.
     */
    localTime: number = 0;

    /** Local seconds owed from a previous tick (step-piece budget hit). Serialized only when non-zero. */
    timeDebt: number = 0;

    /** Projectile buffs (tempo modifiers, ...). Durations are in world time. Serialized when non-empty. */
    buffs: ProjectileBuff[] = [];

    /** Counter for generated buff ids; serialized with the buffs. */
    private nextBuffSeq: number = 0;

    /** Optional summons metadata (seed pods). */
    summonSeedWeak?: boolean;

    /** Unit IDs that got a knockback-only hit this flight (overflow `knockbackOnly`). Serialized like `hitUnitIds`. */
    readonly knockbackOnlyUnitIds: Set<string> = new Set();

    /** When set, erases matching ground/air effects from tiles along the flight path. Serialized. */
    clearsTerrainEffects?: ProjectileTerrainClear;

    /** Tile keys (`col,row`) already swept for terrain clearing this flight. Serialized as an array. */
    readonly clearedTerrainCells: Set<string> = new Set();

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        velocityX: number;
        velocityY: number;
        damage: number;
        sourceTeamId: TeamId;
        sourceUnitId: string;
        sourceAbilityId: string;
        maxDistance: number;
        trailType?: 'bullet';
        projectileType?: string;
        arcHeight?: number;
        rotationSpeed?: number;
        spriteConfig?: SpriteProjectileConfig;
        modifiers?: ProjectileModifierId[];
        /** Terrain types the projectile stops at; see `Projectile.collidesWithTerrain`. */
        collidesWithTerrain?: TerrainType[];
        passThroughEnemies?: boolean;
        pierce?: number;
        summonSeedWeak?: boolean;
        hitShape?: 'circle' | 'rect';
        rectStartWidth?: number;
        rectEndWidth?: number;
        /** Damage/overflow/knockback policy. When set, the legacy hit options below are ignored. */
        hitPolicy?: ProjectileHitPolicy;
        /** @deprecated Use `hitPolicy`. Still accepted; see `hitPolicyFromLegacyOptions`. */
        knockbackTier?: number;
        /** @deprecated Use `hitPolicy.overflow: 'passThrough'`. */
        continueAfterMaxHits?: boolean;
        /** @deprecated Use `hitPolicy.knockback.direction`. */
        knockbackMode?: 'forward' | 'side45';
        /** @deprecated Use `hitPolicy.overflow: 'knockbackOnly'`. */
        knockbackBeyondMaxHits?: boolean;
        /** Start held by a cast (not moving or colliding) until `release()` or `cancelHeld()`. */
        heldBy?: ProjectileHolder;
        /** Erase ground/air effects from tiles along the flight path. */
        clearsTerrainEffects?: ProjectileTerrainClear;
    }) {
        super(config.id ?? generateGameObjectId('proj'), config.x, config.y);
        this.velocityX = config.velocityX;
        this.velocityY = config.velocityY;
        this.damage = config.damage;
        this.sourceTeamId = config.sourceTeamId;
        this.sourceUnitId = config.sourceUnitId;
        this.sourceAbilityId = config.sourceAbilityId;
        this.maxDistance = config.maxDistance;
        this.trailType = config.trailType;
        this.projectileType = config.projectileType ?? 'default';
        this.arcHeight = config.arcHeight;
        this.rotationSpeed = config.rotationSpeed;
        this.spriteConfig = config.spriteConfig;
        this.modifiers = [...(config.modifiers ?? [])];
        this.collidesWithTerrain = [...(config.collidesWithTerrain ?? [])];
        this.passThroughEnemies = config.passThroughEnemies ?? false;
        this.summonSeedWeak = config.summonSeedWeak;
        this.hitShape = config.hitShape ?? 'circle';
        this.rectStartWidth = config.rectStartWidth;
        this.rectEndWidth = config.rectEndWidth;
        this.hitPolicy = cloneHitPolicy(config.hitPolicy ?? hitPolicyFromLegacyOptions(config));
        this.heldBy = config.heldBy ? { unitId: config.heldBy.unitId, abilityId: config.heldBy.abilityId } : null;
        this.clearsTerrainEffects = config.clearsTerrainEffects
            ? cloneTerrainClear(config.clearsTerrainEffects)
            : undefined;
        this.frameStartX = config.x;
        this.frameStartY = config.y;
    }

    /** True while the launching cast still holds this projectile (before release). */
    get isHeld(): boolean {
        return this.heldBy !== null;
    }

    /**
     * Launch a held projectile with the given velocity. It moves and collides from the next
     * `update()` / `checkCollision()`. No-op when the projectile is not held.
     */
    release(velocityX: number, velocityY: number): void {
        if (!this.heldBy) return;
        this.heldBy = null;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
    }

    /**
     * Remove a held projectile without any expire effect or `onProjectileExpired` (the cast's
     * interrupt handler is responsible for any replacement, such as a rock). No-op when not held.
     */
    cancelHeld(): void {
        if (!this.heldBy) return;
        this.heldBy = null;
        this.active = false;
    }

    /**
     * Add a buff. `appliedAtTime` is world time (`engine.gameTime`); `duration` is world seconds
     * (`null` = until removed). Returns the stored buff.
     */
    addBuff(input: {
        sourceId: string;
        appliedAtTime: number;
        duration: number | null;
        timeModifier?: TimeModifier;
        id?: string;
    }): ProjectileBuff {
        const buff: ProjectileBuff = cloneProjectileBuff({
            id: input.id ?? `${this.id}_pbuff_${this.nextBuffSeq++}`,
            sourceId: input.sourceId,
            appliedAtTime: input.appliedAtTime,
            duration: input.duration,
            ...(input.timeModifier ? { timeModifier: input.timeModifier } : {}),
        });
        this.buffs.push(buff);
        return buff;
    }

    /** Remove every buff applied by `sourceId`. Returns how many were removed. */
    removeBuffsFromSource(sourceId: string): number {
        const before = this.buffs.length;
        this.buffs = this.buffs.filter((b) => b.sourceId !== sourceId);
        return before - this.buffs.length;
    }

    /**
     * Drop buffs that have ended. World-time buffs use `gameTime`. A hit-pause buff uses
     * `hitPauseSteps`: it stays for the step about to run, then the count drops, so the projectile
     * is frozen for exactly that many steps even though expiry runs before the step.
     */
    expireBuffs(gameTime: number): void {
        if (this.buffs.length === 0) return;
        const kept: ProjectileBuff[] = [];
        for (const buff of this.buffs) {
            if (buff.hitPauseSteps !== undefined) {
                if (buff.hitPauseSteps <= 0) continue;
                buff.hitPauseSteps -= 1;
                kept.push(buff);
                continue;
            }
            if (!isProjectileBuffExpired(buff, gameTime)) kept.push(buff);
        }
        this.buffs = kept;
    }

    /** Time modifiers carried by this projectile's buffs (projectiles start at tempo 1, not the caster's). */
    getTimeModifiers(): TimeModifier[] {
        const mods: TimeModifier[] = [];
        for (const b of this.buffs) if (b.timeModifier) mods.push(b.timeModifier);
        return mods;
    }

    /** Product of the projectile's tempo modifiers, clamped; 0 while frozen. 1 with no buffs. */
    getTempo(): number {
        return this.buffs.length === 0 ? 1 : resolveTempo(this.getTimeModifiers());
    }

    /**
     * Advance this projectile by `stepDt` local seconds (plus carried `timeDebt`), cutting the step
     * into pieces of at most `MAX_PIECE_TRAVEL_PX` of travel. Wall stop and unit collision run per
     * piece, so a fast projectile cannot tunnel. A step of at most `FIXED_DT` with no debt is a single
     * piece (pace-1 invariance). Leftover beyond `MAX_STEP_PIECES_PER_TICK` becomes `timeDebt`.
     */
    advance(stepDt: number, ctx: EngineContext): void {
        if (!this.active) return;
        const total = stepDt + this.timeDebt;
        this.timeDebt = 0;
        if (total <= 0) return;

        let pieces = 1;
        let pieceDt = total;
        if (total > FIXED_DT && !this.heldBy) {
            const speed = Math.hypot(this.velocityX, this.velocityY);
            const maxPieceDt = speed > 0 ? MAX_PIECE_TRAVEL_PX / speed : total;
            const needed = Math.max(1, Math.ceil(total / maxPieceDt));
            if (needed > MAX_STEP_PIECES_PER_TICK) {
                pieces = MAX_STEP_PIECES_PER_TICK;
                pieceDt = maxPieceDt;
                this.timeDebt = total - pieceDt * pieces;
            } else {
                pieces = needed;
                pieceDt = needed === 1 ? total : total / needed;
            }
        }

        for (let i = 0; i < pieces; i++) {
            if (!this.active) break;
            this.localTime += pieceDt;
            this.update(pieceDt, ctx);
            this.checkCollision(ctx.units, ctx.eventBus, ctx.gameTime, ctx);
        }
        if (!this.active) this.timeDebt = 0;
    }

    update(dt: number, engine: unknown): void {
        if (!this.active) return;

        if (this.heldBy) {
            this.updateHeld(dt, engine);
            return;
        }

        const prevX = this.x;
        const prevY = this.y;
        this.frameStartX = prevX;
        this.frameStartY = prevY;

        const moveX = this.velocityX * dt;
        const moveY = this.velocityY * dt;
        this.x += moveX;
        this.y += moveY;
        if (this.rotationSpeed) {
            this.rotation = (this.rotation + this.rotationSpeed * dt) % 360;
        }
        const terrainManager = (engine as { terrainManager?: TerrainManager | null })?.terrainManager ?? null;
        const stopsAtTerrain = this.modifiers.includes('stopsAtWalls') || this.collidesWithTerrain.length > 0;
        if (terrainManager && stopsAtTerrain && (moveX !== 0 || moveY !== 0)) {
            const stop = this.findWallStop(prevX, prevY, this.x, this.y, terrainManager);
            if (stop) {
                // Stops at the last sample before the obstruction: the resting position is
                // decided by the ability's onProjectileExpired, not snapped here.
                this.x = stop.x;
                this.y = stop.y;
                this.distanceTraveled += this.calculateDistanceContribution(prevX, prevY, stop.x, stop.y, terrainManager);
                this.clearTerrainAlongPath(prevX, prevY, engine);
                this.triggerExpireEffect(engine);
                this.active = false;
                return;
            }
        }
        this.distanceTraveled += this.calculateDistanceContribution(prevX, prevY, this.x, this.y, terrainManager);
        this.clearTerrainAlongPath(prevX, prevY, engine);

        if (this.trailType === 'bullet' || this.spriteConfig?.trail) {
            const eng = engine as { addEffect?: (effect: Effect) => void };
            if (typeof eng.addEffect === 'function') {
                const dx = this.x - prevX;
                const dy = this.y - prevY;
                if (dx !== 0 || dy !== 0) {
                    const trail = new Effect({
                        x: prevX,
                        y: prevY,
                        duration: 0.2,
                        effectType: 'BulletTrail',
                        effectRadius: 3,
                        effectData: { dx, dy },
                    });
                    eng.addEffect(trail);
                }
            }
        }

        // Deactivate if max distance reached
        if (this.distanceTraveled >= this.maxDistance) {
            this.triggerExpireEffect(engine);
            this.active = false;
        }
    }

    /**
     * Erases terrain effects on tiles within the sweep width of the segment from (`fromX`, `fromY`) to the
     * current position. Tiles already swept this flight are skipped. Does nothing when the projectile has no
     * `clearsTerrainEffects`, or when the engine lacks `terrainLayers` / `eventBus` (stub engines in tests).
     */
    private clearTerrainAlongPath(fromX: number, fromY: number, engine: unknown): void {
        const clear = this.clearsTerrainEffects;
        if (!clear) return;
        const eng = engine as { terrainLayers?: TerrainLayerManager | null; eventBus?: EventBus | null } | null | undefined;
        const terrainLayers = eng?.terrainLayers;
        const bus = eng?.eventBus;
        if (!terrainLayers || !bus) return;

        const swept = cellsAlongSegment({ x: fromX, y: fromY }, { x: this.x, y: this.y }, clear.sweepWidth ?? this.radius);
        const fresh = swept.filter((cell) => {
            const key = `${cell.col},${cell.row}`;
            if (this.clearedTerrainCells.has(key)) return false;
            this.clearedTerrainCells.add(key);
            return true;
        });
        if (fresh.length === 0) return;
        clearTerrainEffects({ terrainLayers, eventBus: bus }, fresh, clear.spec, {
            unitId: this.sourceUnitId,
            abilityId: this.sourceAbilityId,
        });
    }

    /**
     * For `stopsAtWalls` / `collidesWithTerrain`: sample the swept segment from `from` to `to` one pixel at a time (so no
     * wall is skipped, however fast the projectile moves). Returns the last sample before the first
     * sample that is obstructed and not traversed by another modifier, or null if the segment is
     * clear. Stonephase therefore flies through rock, and stops at the first obstruction it does
     * not cover.
     */
    private findWallStop(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        terrainManager: TerrainManager,
    ): { x: number; y: number } | null {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const totalDistance = Math.sqrt(dx * dx + dy * dy);
        if (totalDistance === 0) return null;

        const steps = Math.max(1, Math.ceil(totalDistance));
        const stopsAtWalls = this.modifiers.includes('stopsAtWalls');
        let prevSampleX = fromX;
        let prevSampleY = fromY;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const sampleX = fromX + dx * t;
            const sampleY = fromY + dy * t;
            const terrainType = terrainManager.getProjectileTerrainAt(sampleX, sampleY);
            const obstructs =
                (stopsAtWalls && TERRAIN_PROPERTIES[terrainType].blocksProjectiles) ||
                this.collidesWithTerrain.includes(terrainType);
            if (obstructs && !isTraversableByModifiers(terrainType, this.modifiers)) {
                const cell = terrainManager.grid.worldToGrid(sampleX, sampleY);
                this.stoppedAtTerrain = { col: cell.col, row: cell.row, terrainType };
                return { x: prevSampleX, y: prevSampleY };
            }
            prevSampleX = sampleX;
            prevSampleY = sampleY;
        }
        return null;
    }

    /** Held tick: no movement, no distance, no trail. Deletes the projectile past the orphan limit. */
    private updateHeld(dt: number, engine: unknown): void {
        this.frameStartX = this.x;
        this.frameStartY = this.y;
        this.heldTime += dt;
        if (this.heldTime <= MAX_HELD_PROJECTILE_SECONDS) return;
        this.warnOrphaned(engine);
        this.heldBy = null;
        this.active = false;
    }

    /** Logs the diagnostics needed to find the cast that lost its held projectile. */
    private warnOrphaned(engine: unknown): void {
        const holder = this.heldBy;
        if (!holder) return;
        const eng = engine as {
            gameTick?: number;
            gameTime?: number;
            getUnit?: (id: string) => Unit | undefined;
        } | null | undefined;
        const holderUnit = eng?.getUnit?.(holder.unitId);
        console.warn(
            `[Projectile] held projectile orphaned: projectile=${this.id} heldBy=${holder.unitId}/${holder.abilityId} heldTime=${this.heldTime.toFixed(2)}s`,
            {
                projectileId: this.id,
                projectileType: this.projectileType,
                sourceAbilityId: this.sourceAbilityId,
                sourceUnitId: this.sourceUnitId,
                heldBy: { ...holder },
                heldTime: this.heldTime,
                x: this.x,
                y: this.y,
                gameTick: eng?.gameTick,
                gameTime: eng?.gameTime,
                holderExists: holderUnit !== undefined,
                holderAlive: holderUnit?.isAlive() ?? false,
                holderHasActiveCast: holderUnit?.activeAbilities.some((a) => a.abilityId === holder.abilityId) ?? false,
            },
        );
    }

    /**
     * Check collision against a list of units and deal damage to hit enemies.
     *
     * The projectile damages up to `hitPolicy.damagingHits` units, then applies `hitPolicy.overflow`.
     * When multiple units overlap the projectile in a single frame, only
     * `damagingHits - already_hit` of them take damage, choosing the closest first.
     *
     * Units with IFrames or an active block immediately consume the projectile.
     * A contact that is neither of those — a damaging hit or a knockback-only overflow —
     * freezes this projectile (hitstop) and that unit (hitstun). The caster is not frozen.
     * Returns the last unit hit this frame, or null.
     */
    checkCollision(units: Unit[], eventBus: EventBus, gameTime: number, engine?: unknown): Unit | null {
        if (!this.active) return null;
        if (this.heldBy) return null;
        if (this.passThroughEnemies) return null;

        const maxHits = this.hitPolicy.damagingHits;
        const knockbackOverflow = this.hitPolicy.overflow === 'knockbackOnly';
        const continuesAfterMaxHits = this.hitPolicy.overflow !== 'stop';
        const hitsRemaining = maxHits - this.hitUnitIds.size;
        if (hitsRemaining <= 0 && !knockbackOverflow) {
            if (!continuesAfterMaxHits) this.active = false;
            return null;
        }

        // Collect colliding enemies not already hit, sorted closest-first.
        const candidates: Array<{ unit: Unit; dist: number }> = [];
        if (this.hitShape === 'rect') {
            // Sweep a thin rectangular slice from where this tick started to where it ended,
            // widening over travel progress. Contiguous ticks union into the full swept shape.
            const stepLen = Math.hypot(this.x - this.frameStartX, this.y - this.frameStartY);
            const travelLen = Math.hypot(this.velocityX, this.velocityY) || 1;
            const dirX = this.velocityX / travelLen;
            const dirY = this.velocityY / travelLen;
            const perpX = -dirY;
            const perpY = dirX;
            const progress = this.maxDistance > 0 ? Math.min(1, this.distanceTraveled / this.maxDistance) : 1;
            const startWidth = this.rectStartWidth ?? 0;
            const endWidth = this.rectEndWidth ?? 0;
            const halfWidth = (startWidth + (endWidth - startWidth) * progress) / 2;
            for (const unit of units) {
                if (!unit.isAlive() || unit.isUntargetable()) continue;
                if (!areEnemies(this.sourceTeamId, unit.teamId)) continue;
                if (this.hitUnitIds.has(unit.id) || this.knockbackOnlyUnitIds.has(unit.id)) continue;
                const relX = unit.x - this.frameStartX;
                const relY = unit.y - this.frameStartY;
                const along = relX * dirX + relY * dirY;
                if (along < -unit.radius || along > stepLen + unit.radius) continue;
                const perp = relX * perpX + relY * perpY;
                if (Math.abs(perp) > halfWidth + unit.radius) continue;
                const dist = Math.hypot(unit.x - this.x, unit.y - this.y);
                candidates.push({ unit, dist });
            }
        } else {
            for (const unit of units) {
                if (!unit.isAlive() || unit.isUntargetable()) continue;
                if (!areEnemies(this.sourceTeamId, unit.teamId)) continue;
                if (this.hitUnitIds.has(unit.id) || this.knockbackOnlyUnitIds.has(unit.id)) continue;
                const dx = unit.x - this.x;
                const dy = unit.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= this.radius + unit.radius) {
                    candidates.push({ unit, dist });
                }
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.dist - b.dist);

        const toHit = candidates.slice(0, Math.max(0, hitsRemaining));
        let lastHit: Unit | null = null;

        // Overflow targets: knocked back but not damaged (overflow `knockbackOnly`).
        if (knockbackOverflow && engine) {
            for (const { unit } of candidates.slice(toHit.length)) {
                if (unit.hasIFrames(gameTime)) continue;
                this.knockbackOnlyUnitIds.add(unit.id);
                this.applyHitKnockback(unit, engine);
                this.applyStrikeContactPauses(unit, gameTime, engine);
            }
        }

        for (const { unit } of toHit) {
            if (unit.hasIFrames(gameTime)) {
                continue;
            }
            if (engine && canAttackBeBlocked(unit, this.x, this.y, gameTime)) {
                const block = getBlockingArcForUnit(unit, gameTime);
                if (block) {
                    executeBlock(
                        engine,
                        unit,
                        {
                            type: 'projectile',
                            projectile: this,
                            sourceUnitId: this.sourceUnitId,
                            attackSourceX: this.x,
                            attackSourceY: this.y,
                        },
                        this.sourceAbilityId,
                        block,
                    );
                    return null;
                }
            }

            const sourceUnit = (engine as { getUnit?: (id: string) => Unit | undefined } | undefined)?.getUnit?.(this.sourceUnitId);
            const sourceAbility = getAbility(this.sourceAbilityId);
            const modifiedDamage = getModifiedAbilityDamage(
                sourceUnit,
                this.damage,
                sourceAbility?.damageModifierMultiplier,
            );
            // Return value unused; ON_ATTACK_HIT fires unconditionally below regardless of
            // shield absorption on this direct path, so the breakdown wouldn't change anything here.
            unit.takeDamage(modifiedDamage, this.sourceUnitId, eventBus);
            if (engine) {
                triggerAbilityEventFromAttack({
                    engine: engine as {
                        gameTime: number;
                        roundNumber: number;
                        getUnit(id: string): Unit | undefined;
                        generateRandomInteger(min: number, max: number): number;
                        eventBus: EventBus;
                        getPlayerResearchNodes?: (playerId: string, treeId: string) => string[];
                        interruptUnitAndRefundAbilities?: (unit: Unit) => void;
                    },
                    attackingAbilityId: this.sourceAbilityId,
                    sourceUnitId: this.sourceUnitId,
                    eventType: AbilityEventType.ON_ATTACK_HIT,
                    hitResult: 'hit',
                    primaryTarget: unit,
                });
            }
            if (engine) {
                this.applyHitKnockback(unit, engine);
            }
            this.applyStrikeContactPauses(unit, gameTime, engine);
            eventBus.emit('projectile_hit', {
                projectileId: this.id,
                targetUnitId: unit.id,
                damage: modifiedDamage,
            });

            this.hitUnitIds.add(unit.id);
            lastHit = unit;
        }

        // Deactivate when all damaging hits are spent — unless the overflow policy keeps the
        // projectile flying, in which case it stops colliding but its expire effect/visual
        // still waits for the real end of flight (maxDistance, handled in update()).
        if (this.hitUnitIds.size >= maxHits && !continuesAfterMaxHits) {
            if (engine) this.triggerExpireEffect(engine, lastHit?.id);
            this.active = false;
        }

        return lastHit;
    }

    /**
     * A landed contact (damaging hit or knockback-only overflow). Hitstop freezes this projectile;
     * hitstun freezes `unit`. Lengths come from `sourceAbilityId`; each body's tempo scales its own
     * pause. The caster (`sourceUnitId`) is not frozen. World time is `gameTime`. An iFrame miss and
     * a facing block never reach here. Stub collisions with no engine round apply nothing.
     */
    private applyStrikeContactPauses(unit: Unit, gameTime: number, engine: unknown): void {
        const roundNumber = (engine as { roundNumber?: number } | undefined)?.roundNumber;
        if (roundNumber === undefined) return;
        const impact = resolveHitImpactSeconds(getAbility(this.sourceAbilityId));
        applyProjectileHitStop(this, impact.hitstopSeconds, gameTime);
        applyUnitHitPause(unit, { seconds: impact.hitstunSeconds, kind: 'hit_stun' }, gameTime, roundNumber);
    }

    /** Knock `unit` back per `hitPolicy.knockback` (no-op when the policy has no knockback). */
    private applyHitKnockback(unit: Unit, engine: unknown): void {
        const knockback = this.hitPolicy.knockback;
        if (!knockback || !knockback.tier) return;
        const travelLen = Math.hypot(this.velocityX, this.velocityY) || 1;
        const direction = resolveHitKnockbackDirection(
            knockback.direction,
            { x: this.velocityX / travelLen, y: this.velocityY / travelLen },
            { x: this.x, y: this.y },
            { x: unit.x, y: unit.y },
        );
        applyDirectionalKnockback(
            unit,
            knockback.tier,
            direction,
            { unitId: this.sourceUnitId, abilityId: this.sourceAbilityId },
            knockbackCtxFromEngine(engine as {
                gameTime: number;
                roundNumber?: number;
                eventBus: EventBus;
                interruptUnitAndRefundAbilities?: (unit: Unit) => void;
            }),
        );
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'projectile',
            id: this.id,
            x: this.x,
            y: this.y,
            active: this.active,
            velocityX: this.velocityX,
            velocityY: this.velocityY,
            damage: this.damage,
            sourceTeamId: this.sourceTeamId,
            sourceUnitId: this.sourceUnitId,
            sourceAbilityId: this.sourceAbilityId,
            maxDistance: this.maxDistance,
            distanceTraveled: this.distanceTraveled,
            radius: this.radius,
            trailType: this.trailType,
            projectileType: this.projectileType,
            spriteConfig: this.spriteConfig,
            modifiers: this.modifiers,
            ...(this.collidesWithTerrain.length > 0 ? { collidesWithTerrain: [...this.collidesWithTerrain] } : {}),
            passThroughEnemies: this.passThroughEnemies,
            hitPolicy: cloneHitPolicy(this.hitPolicy),
            hitShape: this.hitShape,
            rectStartWidth: this.rectStartWidth,
            rectEndWidth: this.rectEndWidth,
            heldBy: this.heldBy ? { ...this.heldBy } : null,
            heldTime: this.heldTime,
            ...(this.localTime !== 0 ? { localTime: this.localTime } : {}),
            ...(this.timeDebt !== 0 ? { timeDebt: this.timeDebt } : {}),
            ...(this.buffs.length > 0
                ? { buffs: this.buffs.map(cloneProjectileBuff), nextBuffSeq: this.nextBuffSeq }
                : this.nextBuffSeq > 0 ? { nextBuffSeq: this.nextBuffSeq } : {}),
            hitUnitIds: [...this.hitUnitIds],
            knockbackOnlyUnitIds: [...this.knockbackOnlyUnitIds],
            ...(this.clearsTerrainEffects
                ? {
                    clearsTerrainEffects: cloneTerrainClear(this.clearsTerrainEffects),
                    clearedTerrainCells: [...this.clearedTerrainCells],
                }
                : {}),
            ...(this.summonSeedWeak !== undefined ? { summonSeedWeak: this.summonSeedWeak } : {}),
            ...(this.arcHeight !== undefined ? { arcHeight: this.arcHeight } : {}),
            ...(this.rotationSpeed !== undefined ? { rotationSpeed: this.rotationSpeed, rotation: this.rotation } : {}),
        };
    }

    static fromJSON(data: Record<string, unknown>): Projectile {
        const heldBy = data.heldBy as ProjectileHolder | null | undefined;
        const proj = new Projectile({
            id: data.id as string,
            x: data.x as number,
            y: data.y as number,
            velocityX: data.velocityX as number,
            velocityY: data.velocityY as number,
            damage: data.damage as number,
            sourceTeamId: data.sourceTeamId as TeamId,
            sourceUnitId: data.sourceUnitId as string,
            sourceAbilityId: (data.sourceAbilityId as string) ?? 'throw_knife',
            maxDistance: data.maxDistance as number,
            modifiers: (data.modifiers as ProjectileModifierId[] | undefined) ?? [],
            collidesWithTerrain: data.collidesWithTerrain as TerrainType[] | undefined,
            heldBy: heldBy ?? undefined,
            clearsTerrainEffects: data.clearsTerrainEffects as ProjectileTerrainClear | undefined,
            // Saves from before `hitPolicy` carry the legacy fields, which the constructor maps.
            hitPolicy: (data.hitPolicy as ProjectileHitPolicy | undefined) ?? undefined,
            pierce: data.pierce as number | undefined,
            knockbackTier: data.knockbackTier as number | undefined,
            continueAfterMaxHits: data.continueAfterMaxHits as boolean | undefined,
            knockbackBeyondMaxHits: data.knockbackBeyondMaxHits as boolean | undefined,
            knockbackMode: data.knockbackMode as 'forward' | 'side45' | undefined,
        });
        proj.heldTime = (data.heldTime as number | undefined) ?? 0;
        proj.localTime = (data.localTime as number | undefined) ?? 0;
        proj.timeDebt = (data.timeDebt as number | undefined) ?? 0;
        proj.buffs = ((data.buffs as ProjectileBuff[] | undefined) ?? []).map(cloneProjectileBuff);
        proj.nextBuffSeq = (data.nextBuffSeq as number | undefined) ?? 0;
        for (const id of (data.hitUnitIds as string[] | undefined) ?? []) proj.hitUnitIds.add(id);
        for (const id of (data.knockbackOnlyUnitIds as string[] | undefined) ?? []) proj.knockbackOnlyUnitIds.add(id);
        for (const key of (data.clearedTerrainCells as string[] | undefined) ?? []) proj.clearedTerrainCells.add(key);
        proj.active = data.active as boolean;
        proj.distanceTraveled = data.distanceTraveled as number;
        proj.radius = (data.radius as number) ?? 5;
        proj.trailType = (data.trailType as 'bullet' | undefined) ?? undefined;
        proj.projectileType = (data.projectileType as string | undefined) ?? 'default';
        proj.spriteConfig = data.spriteConfig as SpriteProjectileConfig | undefined;
        proj.passThroughEnemies = (data.passThroughEnemies as boolean | undefined) ?? false;
        proj.hitShape = (data.hitShape as 'circle' | 'rect' | undefined) ?? 'circle';
        proj.rectStartWidth = data.rectStartWidth as number | undefined;
        proj.rectEndWidth = data.rectEndWidth as number | undefined;
        if (data.summonSeedWeak !== undefined) proj.summonSeedWeak = data.summonSeedWeak as boolean;
        if (data.arcHeight !== undefined) proj.arcHeight = data.arcHeight as number;
        if (data.rotationSpeed !== undefined) proj.rotationSpeed = data.rotationSpeed as number;
        if (data.rotation !== undefined) proj.rotation = data.rotation as number;
        return proj;
    }

    private triggerExpireEffect(engine: unknown, hitUnitId?: string): void {
        if (!this.active) return;
        triggerAbilityEventFromProjectileExpiry({ engine, projectile: this, hitUnitId });
        const caster = (engine as { getUnit?: (id: string) => Unit | undefined }).getUnit?.(this.sourceUnitId);
        if (!caster) return;
        const ability = getAbility(this.sourceAbilityId);
        ability?.onProjectileExpired?.(engine, caster, this, hitUnitId);
        if (this.onHitEffects?.length) {
            const hitUnit = hitUnitId
                ? (engine as { getUnit?: (id: string) => Unit | undefined }).getUnit?.(hitUnitId)
                : undefined;
            const impactTarget = hitUnit
                ? { x: hitUnit.x, y: hitUnit.y, radius: hitUnit.radius }
                : { x: this.x, y: this.y, radius: 0 };
            applyVisualEffectDefs(
                this.onHitEffects,
                { x: caster.x, y: caster.y, radius: caster.radius, characterId: '' },
                engine as EngineContext,
                { target: impactTarget },
            );
        }
    }

    private calculateDistanceContribution(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        terrainManager: TerrainManager | null,
    ): number {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const totalDistance = Math.sqrt(dx * dx + dy * dy);
        if (totalDistance === 0) return 0;
        if (!terrainManager || this.modifiers.length === 0) return totalDistance;

        const steps = Math.max(1, Math.ceil(totalDistance));
        const segmentDistance = totalDistance / steps;
        let countedDistance = 0;

        for (let i = 0; i < steps; i++) {
            const tStart = i / steps;
            const tEnd = (i + 1) / steps;
            const sampleT = (tStart + tEnd) / 2;
            const sampleX = fromX + dx * sampleT;
            const sampleY = fromY + dy * sampleT;
            const terrainType = terrainManager.getTerrainAt(sampleX, sampleY) ?? TerrainType.Grass;
            if (shouldCountTraversalDistance({ terrainType, segmentDistance }, this.modifiers)) {
                countedDistance += segmentDistance;
            }
        }

        return countedDistance;
    }
}
