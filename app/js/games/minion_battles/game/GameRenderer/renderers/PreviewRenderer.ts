import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { ResolvedTarget } from '../../types';
import type { TeamId } from '../../teams';

export class PreviewRenderer {
    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {}

    render(
        engine: GameEngine,
        localTeamId: TeamId,
        targetingState: {
            selectedAbility: AbilityStatic | null;
            currentTargets: ResolvedTarget[];
            mouseWorld: { x: number; y: number };
            waitingForOrders: { unitId?: string } | null;
            previewOrderUnitId?: string | null;
        } | null,
    ): void {
        // TODO: migrate renderMoveTargets(), renderGhostPreviews(), renderActiveAbilityPreviews(),
        //       renderTargetingPreview(), drawPlayerMoveTargetPathWithCap(), drawEnemyGhostMovePath(),
        //       enemyUnitHiddenInFullDarkness(), and mouseWorldForGhostAbilityPreview() from GameRenderer.
        //       PreviewRenderer owns: moveTargetVisuals map, abilityPreviewGraphics,
        //       targetingPreviewGraphics, ghostPreviewGraphics.
    }

    destroy(): void {
        // TODO: destroy moveTargetVisuals and preview graphics
    }
}
