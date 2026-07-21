import type { Container } from 'pixi.js';
import { Projectile } from '../../projectiles/Projectile';
import type { AssetRegistry } from '../AssetRegistry';
import { getProjectileDef } from '../../projectiles/projectile_defs';

const Z_PROJECTILES = 11;

export class ProjectileRenderer {
    private projectileVisuals: Map<string, Container> = new Map();

    constructor(
        private readonly gameContainer: Container,
        private readonly _assets: AssetRegistry,
    ) {}

    setLayerVisible(visible: boolean): void {
        if (visible) return;
        for (const visual of this.projectileVisuals.values()) {
            visual.visible = false;
        }
    }

    render(projectiles: Projectile[], gameTime: number): void {
        for (const proj of projectiles) {
            let visual = this.projectileVisuals.get(proj.id);
            if (!visual) {
                visual = getProjectileDef(proj.projectileType).createVisual(proj);
                visual.zIndex = Z_PROJECTILES;
                this.projectileVisuals.set(proj.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = proj.x;
            visual.y = proj.y;
            visual.visible = proj.active;
            getProjectileDef(proj.projectileType).updateVisual(visual, proj, gameTime);
            if (proj.rotationSpeed) {
                visual.rotation = (proj.rotation * Math.PI) / 180;
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
