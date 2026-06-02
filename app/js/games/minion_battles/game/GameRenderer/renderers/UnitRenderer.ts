import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';
import type { TeamId } from '../../teams';

export class UnitRenderer {
    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {}

    render(engine: GameEngine, localTeamId: TeamId): void {
        // TODO: migrate renderUnits(), renderConstructionGhosts(), and hit-flash logic
        //       (onDamageTaken, startHitFlash, clearHitFlashes, syncAllUnitCharacterSprites)
        //       from GameRenderer. UnitRenderer owns: unitVisuals, knockbackShadowVisuals,
        //       constructionGhostVisuals, and hit-flash state (hitFlashState).
    }

    destroy(): void {
        // TODO: destroy all unit visuals and cancel hit-flash RAF timers
    }
}
