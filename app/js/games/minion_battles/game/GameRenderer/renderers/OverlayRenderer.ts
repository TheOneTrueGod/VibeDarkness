import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';

export class OverlayRenderer {
    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {}

    render(engine: GameEngine): void {
        // TODO: migrate updateDarknessOverlay(), renderCrystalAura(), renderDarkCrystalAura(),
        //       and fog filter lifecycle from GameRenderer. OverlayRenderer owns:
        //       darknessOverlaySprite, fogTintSprite, fogFilter, crystalAuraGraphics,
        //       darkCrystalAuraGraphics, lightLevelToAlpha (static), lastOverlayTick,
        //       lastRenderTime, lightSystemActive.
        //       After migration, expose getLightAt(col, row): number | null so UnitRenderer
        //       and PreviewRenderer can query it instead of going through the engine.
    }

    destroy(): void {
        // TODO: destroy darknessOverlaySprite, fogTintSprite, fogFilter, aura graphics
    }
}
