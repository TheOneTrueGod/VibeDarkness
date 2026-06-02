import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';

export class LightSourceRenderer {
    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {}

    render(engine: GameEngine): void {
        // TODO: migrate renderLightSources() from GameRenderer.
        //       LightSourceRenderer owns: lightSourceVisuals map.
    }

    destroy(): void {
        // TODO: destroy all lightSourceVisuals
    }
}
