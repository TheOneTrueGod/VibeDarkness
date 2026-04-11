/**
 * ProjectileManager - Owns the projectile list. Handles per-tick
 * movement, collision detection, and cleanup.
 */

import { Projectile } from '../../objects/Projectile';
import type { EngineContext } from '../EngineContext';

export class ProjectileManager {
    projectiles: Projectile[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    addProjectile(projectile: Projectile): void {
        this.projectiles.push(projectile);
    }

    update(dt: number): void {
        for (const proj of this.projectiles) {
            if (!proj.active) continue;
            proj.update(dt, this.ctx);
            proj.checkCollision(this.ctx.units, this.ctx.eventBus, this.ctx.gameTime, this.ctx);
        }
    }

    cleanupInactive(): void {
        this.projectiles = this.projectiles.filter((p) => p.active);
    }

    toJSON(): Record<string, unknown>[] {
        return this.projectiles.map((p) => p.toJSON());
    }

    restoreFromJSON(projDataArray: Record<string, unknown>[]): void {
        this.projectiles = [];
        for (const projData of projDataArray) {
            this.projectiles.push(Projectile.fromJSON(projData));
        }
    }
}
