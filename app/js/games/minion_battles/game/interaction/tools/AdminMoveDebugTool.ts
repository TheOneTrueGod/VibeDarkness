import type { InteractionTool, PlayerInteractionContext, IPlayerInteractionManager } from '../InteractionTool';

/** Debug tool: click to teleport a specific unit to the clicked world position. */
export class AdminMoveDebugTool implements InteractionTool {
    constructor(private readonly unitId: string) {}

    onCanvasClick(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean {
        const { camera, engine } = ctx;
        const worldPos = camera.screenToWorld(screenX, screenY);
        engine.adminMoveUnit(this.unitId, worldPos.x, worldPos.y);
        manager.clearAdminMovePending();
        manager.deactivateTool();
        return true;
    }
}
