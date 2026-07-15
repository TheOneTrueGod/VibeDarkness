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
import { AbilityEventType } from '../../abilities/Ability';
import { getModifiedAbilityDamage } from '../../abilities/damageModifiers';
import { applyBleedStack } from '../../buffs/bleedRuntime';
import { triggerAbilityEventFromAttack, triggerAbilityEventFromProjectileExpiry } from '../../abilities/events';
import { applyDirectionalKnockback, knockbackCtxFromEngine } from '../../crowdControl/knockbackKeywords';
import { TerrainType } from '../../terrain/TerrainType';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { ProjectileModifierId } from './ProjectileTravelModifiers';
import { shouldCountTraversalDistance } from './ProjectileTravelModifiers';
import type { SpriteProjectileConfig } from './projectile_defs';
import type { VisualEffectDef } from '../effects/visualEffectDef';
import type { EngineContext } from '../EngineContext';
import { applyVisualEffectDefs } from '../effects/applyVisualEffectDefs';

const THROW_KNIFE_ABILITY_ID = 'throw_knife';

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
    /** When set, each unit hit is knocked back at this tier in the projectile's direction of travel. */
    knockbackTier?: number;
    /** Optional visual trail type (e.g. 'bullet'). When set, update() will spawn matching effects as the projectile moves. */
    trailType?: 'bullet';
    /** Projectile look variant — key into the projectile def registry. */
    projectileType: string;
    /** Sprite-based config for sprite_projectile type. Travels with the instance and is serialized. */
    spriteConfig?: SpriteProjectileConfig;
    /** Optional behavior modifiers (e.g. stonephase terrain traversal rules). */
    modifiers: ProjectileModifierId[];
    /** Runtime-only: visual effects fired when the projectile reaches its target. Not serialized. */
    onHitEffects?: VisualEffectDef[];

    /**
     * When true, does not collide with units; travels until max distance then expires
     * (e.g. seed pods that only spawn on landing).
     */
    passThroughEnemies: boolean;

    /**
     * How many targets the projectile passes through before stopping.
     * 0 = normal (stops on first hit). 1 = pierces 1, stops on 2nd. Etc.
     * Total hits allowed = pierce + 1.
     */
    pierce: number;

    /**
     * Unit IDs already hit this flight. Used to prevent re-hitting a unit on
     * consecutive frames while the projectile is still overlapping it.
     * Not serialized — resets on deserialization (harmless mid-flight).
     */
    readonly hitUnitIds: Set<string> = new Set();

    /** Optional summons metadata (seed pods). */
    summonSeedWeak?: boolean;

    /**
     * When true, the projectile keeps flying after using up all its pierce hits instead of
     * deactivating — it simply stops colliding with anything further. Only meant for abilities
     * whose visual is expected to keep animating out to `maxDistance` regardless of how many
     * targets it actually hit (e.g. Burst's blood wave); defaults to the normal stop-on-max-hits
     * behavior for every other projectile.
     */
    continueAfterMaxHits: boolean;

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
        spriteConfig?: SpriteProjectileConfig;
        modifiers?: ProjectileModifierId[];
        passThroughEnemies?: boolean;
        pierce?: number;
        summonSeedWeak?: boolean;
        hitShape?: 'circle' | 'rect';
        rectStartWidth?: number;
        rectEndWidth?: number;
        knockbackTier?: number;
        continueAfterMaxHits?: boolean;
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
        this.spriteConfig = config.spriteConfig;
        this.modifiers = config.modifiers ?? [];
        this.passThroughEnemies = config.passThroughEnemies ?? false;
        this.pierce = config.pierce ?? 0;
        this.summonSeedWeak = config.summonSeedWeak;
        this.hitShape = config.hitShape ?? 'circle';
        this.rectStartWidth = config.rectStartWidth;
        this.rectEndWidth = config.rectEndWidth;
        this.knockbackTier = config.knockbackTier;
        this.continueAfterMaxHits = config.continueAfterMaxHits ?? false;
        this.frameStartX = config.x;
        this.frameStartY = config.y;
    }

    update(dt: number, engine: unknown): void {
        if (!this.active) return;

        const prevX = this.x;
        const prevY = this.y;
        this.frameStartX = prevX;
        this.frameStartY = prevY;

        const moveX = this.velocityX * dt;
        const moveY = this.velocityY * dt;
        this.x += moveX;
        this.y += moveY;
        const terrainManager = (engine as { terrainManager?: TerrainManager | null })?.terrainManager ?? null;
        this.distanceTraveled += this.calculateDistanceContribution(prevX, prevY, this.x, this.y, terrainManager);

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
     * Check collision against a list of units and deal damage to hit enemies.
     *
     * For pierce > 0 the projectile passes through `pierce` targets before stopping on the next,
     * hitting each one. When multiple units overlap the projectile in a single frame, only
     * `pierce + 1 - already_hit` of them are processed, choosing the closest first.
     *
     * Units with IFrames or an active block immediately consume the projectile.
     * Returns the last unit hit this frame, or null.
     */
    checkCollision(units: Unit[], eventBus: EventBus, gameTime: number, engine?: unknown): Unit | null {
        if (!this.active) return null;
        if (this.passThroughEnemies) return null;

        const maxHits = this.pierce + 1;
        const hitsRemaining = maxHits - this.hitUnitIds.size;
        if (hitsRemaining <= 0) {
            if (!this.continueAfterMaxHits) this.active = false;
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
                if (!unit.isAlive()) continue;
                if (!areEnemies(this.sourceTeamId, unit.teamId)) continue;
                if (this.hitUnitIds.has(unit.id)) continue;
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
                if (!unit.isAlive()) continue;
                if (!areEnemies(this.sourceTeamId, unit.teamId)) continue;
                if (this.hitUnitIds.has(unit.id)) continue;
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

        const toHit = candidates.slice(0, hitsRemaining);
        let lastHit: Unit | null = null;

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
            if (this.sourceAbilityId === THROW_KNIFE_ABILITY_ID && engine) {
                const e = engine as { gameTime: number; roundNumber: number };
                applyBleedStack(unit, e.gameTime, e.roundNumber, 5);
            }
            if (this.knockbackTier && engine) {
                const travelLen = Math.hypot(this.velocityX, this.velocityY) || 1;
                applyDirectionalKnockback(
                    unit,
                    this.knockbackTier,
                    { x: this.velocityX / travelLen, y: this.velocityY / travelLen },
                    { unitId: this.sourceUnitId, abilityId: this.sourceAbilityId },
                    knockbackCtxFromEngine(engine as {
                        gameTime: number;
                        roundNumber?: number;
                        eventBus: EventBus;
                        interruptUnitAndRefundAbilities?: (unit: Unit) => void;
                    }),
                );
            }
            eventBus.emit('projectile_hit', {
                projectileId: this.id,
                targetUnitId: unit.id,
                damage: modifiedDamage,
            });

            this.hitUnitIds.add(unit.id);
            lastHit = unit;
        }

        // Deactivate when all pierce hits are spent — unless this projectile is meant to keep
        // flying past max hits, in which case it stops colliding but its expire effect/visual
        // still waits for the real end of flight (maxDistance, handled in update()).
        if (this.hitUnitIds.size >= maxHits && !this.continueAfterMaxHits) {
            if (engine) this.triggerExpireEffect(engine, lastHit?.id);
            this.active = false;
        }

        return lastHit;
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
            passThroughEnemies: this.passThroughEnemies,
            pierce: this.pierce,
            hitShape: this.hitShape,
            rectStartWidth: this.rectStartWidth,
            rectEndWidth: this.rectEndWidth,
            knockbackTier: this.knockbackTier,
            continueAfterMaxHits: this.continueAfterMaxHits,
            ...(this.summonSeedWeak !== undefined ? { summonSeedWeak: this.summonSeedWeak } : {}),
        };
    }

    static fromJSON(data: Record<string, unknown>): Projectile {
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
        });
        proj.active = data.active as boolean;
        proj.distanceTraveled = data.distanceTraveled as number;
        proj.radius = (data.radius as number) ?? 5;
        proj.trailType = (data.trailType as 'bullet' | undefined) ?? undefined;
        proj.projectileType = (data.projectileType as string | undefined) ?? 'default';
        proj.spriteConfig = data.spriteConfig as SpriteProjectileConfig | undefined;
        proj.passThroughEnemies = (data.passThroughEnemies as boolean | undefined) ?? false;
        proj.pierce = (data.pierce as number | undefined) ?? 0;
        proj.hitShape = (data.hitShape as 'circle' | 'rect' | undefined) ?? 'circle';
        proj.rectStartWidth = data.rectStartWidth as number | undefined;
        proj.rectEndWidth = data.rectEndWidth as number | undefined;
        proj.knockbackTier = data.knockbackTier as number | undefined;
        proj.continueAfterMaxHits = (data.continueAfterMaxHits as boolean | undefined) ?? false;
        if (data.summonSeedWeak !== undefined) proj.summonSeedWeak = data.summonSeedWeak as boolean;
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
