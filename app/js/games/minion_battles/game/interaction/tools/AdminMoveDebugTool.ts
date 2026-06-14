import type { InteractionTool, PlayerInteractionContext, IPlayerInteractionManager } from '../InteractionTool';

/** Debug tool: click to teleport a specific unit to the clicked world position via the admin move global. */
export class AdminMoveDebugTool implements InteractionTool {
    constructor(private readonly unitId: string) {}

    onCanvasClick(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean {
        const { camera } = ctx;
        const worldPos = camera.screenToWorld(screenX, screenY);
        window.__minionBattlesAdminMoveUnit?.(this.unitId, worldPos.x, worldPos.y);
        window.__minionBattlesAdminMovePendingUnitId = undefined;
        manager.deactivateTool();
        return true;
    }
}
