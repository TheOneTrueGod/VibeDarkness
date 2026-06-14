import { resolveClick } from '../../../abilities/targeting';
import { getDebugState } from '../../../debugState';
import type { InteractionTool, PlayerInteractionContext, IPlayerInteractionManager } from '../InteractionTool';

/** Debug tool: click to select a unit for the DebugConsole unit inspector. */
export class UnitSelectorDebugTool implements InteractionTool {
    onCanvasClick(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean {
        const { engine, camera, renderer } = ctx;
        const result = resolveClick(screenX, screenY, camera, engine.units);
        if (result.unit) {
            renderer.setDebugUnitOutline(null);
            camera.snapTo(result.unit.x, result.unit.y, result.unit.radius);
            window.__minionBattlesDebugAutoFollowPausedUntil = Date.now() + 2500;
            getDebugState().unitSelectorCallback?.(result.unit.id);
        }
        manager.deactivateTool();
        return true;
    }

    onCanvasMouseMove(
        screenX: number,
        screenY: number,
        ctx: PlayerInteractionContext,
        _manager: IPlayerInteractionManager,
    ): boolean {
        const { engine, camera, renderer } = ctx;
        const hoverResult = resolveClick(screenX, screenY, camera, engine.units);
        renderer.setDebugUnitOutline(hoverResult.unit?.id ?? null);
        return false;
    }

    onDeactivate(ctx: PlayerInteractionContext, _manager: IPlayerInteractionManager): void {
        ctx.renderer.setDebugUnitOutline(null);
    }
}
