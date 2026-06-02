import type { Container } from 'pixi.js';
import type { SpecialTile } from '../../specialTiles/SpecialTile';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';

export class SpecialTileRenderer {
    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {}

    render(engine: GameEngine, specialTiles: SpecialTile[]): void {
        // TODO: migrate renderSpecialTiles() and createSpecialTileVisual() from GameRenderer.
        //       SpecialTileRenderer owns: specialTilesContainer and specialTileVisuals map.
    }

    destroy(): void {
        // TODO: destroy specialTilesContainer and all specialTileVisuals
    }
}
