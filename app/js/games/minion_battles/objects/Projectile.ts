/**
 * Projectile - Moves in a straight line, collides with enemy units.
 *
 * Created by abilities (e.g. ThrowKnife). Travels a fixed distance,
 * dealing damage to the first enemy hit, then deactivating.
 */

import { Graphics } from 'pixi.js';
import { GameObject, generateGameObjectId } from './GameObject';
import type { TeamId } from '../engine/teams';
import { areEnemies } from '../engine/teams';
import type { Unit } from './Unit';
import type { EventBus } from '../engine/EventBus';

export class Projectile extends GameObject {
    velocityX: number;
    velocityY: number;
    damage: number;
    sourceTeamId: TeamId;
    sourceUnitId: string;
    maxDistance: number;
    distanceTraveled: number = 0;
    radius: number = 5;

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        velocityX: number;
        velocityY: number;
        damage: number;
        sourceTeamId: TeamId;
        sourceUnitId: string;
        maxDistance: number;
    }) {
        super(config.id ?? generateGameObjectId('proj'), config.x, config.y);
        this.velocityX = config.velocityX;
        this.velocityY = config.velocityY;
        this.damage = config.damage;
        this.sourceTeamId = config.sourceTeamId;
        this.sourceUnitId = config.sourceUnitId;
        this.maxDistance = config.maxDistance;
    }

    update(dt: number, _engine: unknown): void {
        if (!this.active) return;

        const moveX = this.velocityX * dt;
        const moveY = this.velocityY * dt;
        this.x += moveX;
        this.y += moveY;
        this.distanceTraveled += Math.sqrt(moveX * moveX + moveY * moveY);

        // Deactivate if max distance reached
        if (this.distanceTraveled >= this.maxDistance) {
            this.active = false;
        }
    }

    /** Create the Pixi Graphics for this projectile. The projectile owns its own visual representation. */
    static createVisual(projectile: Projectile): Graphics {
        const visual = new Graphics();
        visual.circle(0, 0, projectile.radius);
        visual.fill(0xc0c0c0);
        visual.stroke({ color: 0xffffff, width: 1 });
        return visual;
    }

    /**
     * Check collision against a list of units and deal damage to the first enemy hit.
     * Units with IFrames (e.g. during Dodge) are not hit; the projectile is consumed but no damage is dealt.
     * Returns the unit that was hit and took damage, or null.
     */
    checkCollision(units: Unit[], eventBus: EventBus, gameTime: number): Unit | null {
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
                unit.takeDamage(this.damage, this.sourceUnitId, eventBus);
                eventBus.emit('projectile_hit', {
                    projectileId: this.id,
                    targetUnitId: unit.id,
                    damage: this.damage,
                });
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
            maxDistance: this.maxDistance,
            distanceTraveled: this.distanceTraveled,
            radius: this.radius,
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
            maxDistance: data.maxDistance as number,
        });
        proj.active = data.active as boolean;
        proj.distanceTraveled = data.distanceTraveled as number;
        proj.radius = (data.radius as number) ?? 5;
        return proj;
    }
}
