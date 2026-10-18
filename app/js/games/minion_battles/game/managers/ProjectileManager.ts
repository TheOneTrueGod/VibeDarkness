/**
 * ProjectileManager - Owns the projectile list. Handles per-tick
 * movement, collision detection, and cleanup.
 *
 * Each projectile runs on its own clock: its step per tick is `timeManager.getStepRate(proj, tempo)
 * x FIXED_DT`, where tempo comes from its own buffs (projectiles start at tempo 1, never the
 * caster's). See `game/time/AGENTS.md`.
 */

import { Projectile } from '../projectiles/Projectile';
import type { EngineContext } from '../EngineContext';
import type { TimeManager } from '../time/TimeManager';
import { FIXED_DT } from '../gameConstants';

export class ProjectileManager {
    projectiles: Projectile[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    addProjectile(projectile: Projectile): void {
        this.projectiles.push(projectile);
    }

    /**
     * Step every active projectile. Pace-1 invariance: with no buffs and world pace 1 the step is
     * exactly `FIXED_DT` in one piece, identical to the old single `update(dt)` + `checkCollision`.
     */
    update(timeManager: TimeManager): void {
        for (const proj of this.projectiles) {
            if (!proj.active) continue;
            proj.expireBuffs(this.ctx.gameTime);
            const rate = timeManager.getStepRate(proj, proj.getTempo());
            if (rate <= 0) continue; // frozen: no movement, no held time, debt is kept
            proj.advance(rate === 1 ? FIXED_DT : rate * FIXED_DT, this.ctx);
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
