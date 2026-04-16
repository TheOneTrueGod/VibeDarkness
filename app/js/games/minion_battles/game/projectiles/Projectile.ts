/**
 * Projectile - Moves in a straight line, collides with enemy units.
 *
 * Created by abilities (e.g. ThrowKnife). Travels a fixed distance,
 * dealing damage to the first enemy hit, then deactivating.
 */

import { Graphics } from 'pixi.js';
import { GameObject, generateGameObjectId } from '../GameObject';
import { Effect } from '../effects/Effect';
import type { TeamId } from '../teams';
import { areEnemies } from '../teams';
import type { Unit } from '../units/Unit';
import type { EventBus } from '../EventBus';
import { canAttackBeBlocked, getBlockingArcForUnit, executeBlock } from '../../abilities/blockingHelpers';
import { getAbility } from '../../abilities/AbilityRegistry';

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
    /** Optional visual trail type (e.g. 'bullet'). When set, update() will spawn matching effects as the projectile moves. */
    trailType?: 'bullet';
    /** Projectile look variant for custom rendering. */
    projectileType?: 'default' | 'charged_rock' | 'energy_blast';

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
        projectileType?: 'default' | 'charged_rock' | 'energy_blast';
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
    }

    update(dt: number, engine: unknown): void {
        if (!this.active) return;

        const prevX = this.x;
        const prevY = this.y;

        const moveX = this.velocityX * dt;
        const moveY = this.velocityY * dt;
        this.x += moveX;
        this.y += moveY;
        this.distanceTraveled += Math.sqrt(moveX * moveX + moveY * moveY);

        if (this.trailType === 'bullet') {
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

    /** Create the Pixi Graphics for this projectile. The projectile owns its own visual representation. */
    static createVisual(projectile: Projectile): Graphics {
        const visual = new Graphics();
        if (projectile.projectileType === 'charged_rock') {
            visual.circle(0, 0, projectile.radius + 1);
            visual.fill(0x7a7a7a);
            visual.stroke({ color: 0xd9d9d9, width: 1 });
            visual.moveTo(-8, -4);
            visual.lineTo(-3, -6);
            visual.lineTo(-5, -1);
            visual.lineTo(0, -3);
            visual.stroke({ color: 0x8ef9ff, width: 2, alpha: 0.95 });
            visual.moveTo(2, 1);
            visual.lineTo(7, -1);
            visual.lineTo(4, 4);
            visual.lineTo(9, 3);
            visual.stroke({ color: 0x8ef9ff, width: 2, alpha: 0.95 });
        } else if (projectile.projectileType === 'energy_blast') {
            visual.circle(0, 0, projectile.radius);
            visual.fill({ color: 0x93e7ff, alpha: 0.95 });
            visual.circle(0, 0, projectile.radius * 0.65);
            visual.fill({ color: 0xd8f7ff, alpha: 0.85 });
            visual.circle(0, 0, projectile.radius * 1.25);
            visual.stroke({ color: 0x63d7ff, width: 2, alpha: 0.8 });
        } else {
            visual.circle(0, 0, projectile.radius);
            visual.fill(0xc0c0c0);
            visual.stroke({ color: 0xffffff, width: 1 });
        }
        return visual;
    }

    /**
     * Check collision against a list of units and deal damage to the first enemy hit.
     * Units with IFrames (e.g. during Dodge) are not hit; the projectile is consumed but no damage is dealt.
     * If the defender has a blocking ability and the attack angle is in the block arc, the projectile is destroyed and onAttackBlocked is called.
     * Returns the unit that was hit and took damage, or null.
     */
    checkCollision(units: Unit[], eventBus: EventBus, gameTime: number, engine?: unknown): Unit | null {
        if (!this.active) return null;

        for (const unit of units) {
            if (!unit.isAlive()) continue;
            if (!areEnemies(this.sourceTeamId, unit.teamId)) continue;

            const dx = unit.x - this.x;
            const dy = unit.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const collisionDist = this.radius + unit.radius;

            if (dist <= collisionDist) {
                if (unit.hasIFrames(gameTime)) {
                    this.active = false;
                    return null;
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
                unit.takeDamage(this.damage, this.sourceUnitId, eventBus);
                eventBus.emit('projectile_hit', {
                    projectileId: this.id,
                    targetUnitId: unit.id,
                    damage: this.damage,
                });
                if (engine) {
                    this.triggerExpireEffect(engine, unit.id);
                }
                this.active = false;
                return unit;
            }
        }

        return null;
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
        });
        proj.active = data.active as boolean;
        proj.distanceTraveled = data.distanceTraveled as number;
        proj.radius = (data.radius as number) ?? 5;
        proj.trailType = (data.trailType as 'bullet' | undefined) ?? undefined;
        proj.projectileType = (data.projectileType as 'default' | 'charged_rock' | 'energy_blast' | undefined) ?? 'default';
        return proj;
    }

    private triggerExpireEffect(engine: unknown, hitUnitId?: string): void {
        if (!this.active) return;
        const caster = (engine as { getUnit?: (id: string) => Unit | undefined }).getUnit?.(this.sourceUnitId);
        if (!caster) return;
        const ability = getAbility(this.sourceAbilityId);
        ability?.onProjectileExpired?.(engine, caster, this, hitUnitId);
    }
}
