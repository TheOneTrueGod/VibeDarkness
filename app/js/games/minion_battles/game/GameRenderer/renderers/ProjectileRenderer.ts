import type { Container, Graphics } from 'pixi.js';
import { Projectile } from '../../projectiles/Projectile';
import type { AssetRegistry } from '../AssetRegistry';

const Z_PROJECTILES = 11;

export class ProjectileRenderer {
    private projectileVisuals: Map<string, Graphics> = new Map();

    constructor(
        private readonly gameContainer: Container,
        private readonly _assets: AssetRegistry,
    ) {}

    render(projectiles: Projectile[], gameTime: number): void {
        for (const proj of projectiles) {
            let visual = this.projectileVisuals.get(proj.id);
            if (!visual) {
                visual = Projectile.createVisual(proj);
                visual.zIndex = Z_PROJECTILES;
                this.projectileVisuals.set(proj.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = proj.x;
            visual.y = proj.y;
            if (proj.projectileType === 'bramble_spike' && proj.maxDistance > 0) {
                const t = Math.min(1, proj.distanceTraveled / proj.maxDistance);
                const arcH = Math.min(proj.maxDistance * 0.4, 100);
                visual.y = proj.y - 4 * t * (1 - t) * arcH;
            }
            visual.visible = proj.active;
            if (proj.projectileType === 'throwing_knife') {
                visual.rotation = Math.atan2(proj.velocityY, proj.velocityX) + Math.PI / 2;
            } else {
                visual.rotation = 0;
            }
            if (proj.projectileType === 'energy_blast') {
                const pulseTime = gameTime * 16;
                const pulse = (Math.sin(pulseTime) + 1) / 2;
                visual.scale.set(0.9 + pulse * 0.3);
                visual.alpha = 0.8 + pulse * 0.2;
            } else {
                visual.scale.set(1);
                visual.alpha = 1;
            }
        }

        const activeProjIds = new Set(projectiles.map((p) => p.id));
        for (const [id, visual] of this.projectileVisuals) {
            if (!activeProjIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.projectileVisuals.delete(id);
            }
        }
    }

    destroy(): void {
        for (const visual of this.projectileVisuals.values()) visual.destroy();
        this.projectileVisuals.clear();
    }
}
