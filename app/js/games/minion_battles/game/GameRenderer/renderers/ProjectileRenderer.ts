import type { Container } from 'pixi.js';
import type { Projectile } from '../../projectiles/Projectile';
import type { AssetRegistry } from '../AssetRegistry';

export class ProjectileRenderer {
    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {}

    render(projectiles: Projectile[], gameTime: number): void {
        // TODO: migrate renderProjectiles() from GameRenderer.
        //       ProjectileRenderer owns: projectileVisuals map.
    }

    destroy(): void {
        // TODO: destroy all projectile visuals
    }
}
