import type { InteractionTool, PlayerInteractionContext, IPlayerInteractionManager } from '../InteractionTool';
import { PLAYER_MOVE_WAYPOINT_MAX, buildPlayerMovePathThroughWaypoints } from '../../../terrain/playerMovePath';
import type { Unit } from '../../units/Unit';

const UNIT_HIT_RADIUS = 20;

/** Handles right-click movement, shift waypoints, ctrl pixel-precision, and unit pursuit. */
export class DefaultTool implements InteractionTool {
    pendingMovePath: { col: number; row: number }[] | null = null;
    pendingMoveWaypoints: { col: number; row: number }[] = [];
    pendingMoveTargetUnitId: string | null = null;
    pendingMoveTargetPixel: { x: number; y: number } | null = null;

    reset(): void {
        this.pendingMovePath = null;
        this.pendingMoveWaypoints = [];
        this.pendingMoveTargetUnitId = null;
        this.pendingMoveTargetPixel = null;
    }

    seedFromUnit(unit: Unit): void {
        if (unit.pathInvalidated || !unit.movement) {
            this.reset();
            return;
        }
        const existingPath = unit.movement.path;
        this.pendingMovePath = existingPath.length > 0 ? existingPath.map((p) => ({ ...p })) : null;
        this.pendingMoveTargetUnitId = existingPath.length > 0 ? (unit.movement.targetUnitId ?? null) : null;
        this.pendingMoveTargetPixel =
            existingPath.length > 0 && unit.movement.targetPixel
                ? { ...unit.movement.targetPixel }
                : null;
        this.pendingMoveWaypoints =
            this.pendingMovePath && this.pendingMovePath.length > 0
                ? [{ ...this.pendingMovePath[this.pendingMovePath.length - 1]! }]
                : [];
    }

    onCanvasRightClick(
        screenX: number,
        screenY: number,
        shiftKey: boolean,
        ctrlKey: boolean,
        ctx: PlayerInteractionContext,
        manager: IPlayerInteractionManager,
    ): boolean {
        if (!manager.canUseOrderUi || !manager.waitingForOrders) return false;

        const { engine, camera } = ctx;
        if (!engine.terrainManager) return false;

        const active = engine.state.orderMgr.getActiveOrderWaiterForPlayer(ctx.playerId);
        if (!active) return false;

        const unit = engine.getUnit(active.unitId);
        if (!unit) return false;

        // Guard: unit has conditionalCancelPaused active ability
        if (unit.activeAbilities.some((a) => a.conditionalCancelPaused)) return false;

        const grid = engine.terrainManager.grid;
        const worldPos = camera.screenToWorld(screenX, screenY);
        const worldWidth = engine.getWorldWidth();
        const worldHeight = engine.getWorldHeight();
        const clampedX = Math.max(0, Math.min(worldPos.x, worldWidth));
        const clampedY = Math.max(0, Math.min(worldPos.y, worldHeight));

        const unitGrid = grid.worldToGrid(unit.x, unit.y);

        // CTRL path: pixel-precision move
        if (ctrlKey) {
            const destGrid = grid.worldToGrid(clampedX, clampedY);
            const waypoints = [{ ...destGrid }];
            const fullPath = buildPlayerMovePathThroughWaypoints(
                engine.terrainManager,
                unitGrid.col,
                unitGrid.row,
                waypoints,
            );
            if (fullPath === null) return true;
            const targetPixel = { x: clampedX, y: clampedY };
            this.pendingMoveWaypoints = waypoints;
            this.pendingMovePath = fullPath;
            this.pendingMoveTargetUnitId = null;
            this.pendingMoveTargetPixel = targetPixel;
            unit.setMovement(fullPath, undefined, engine.gameTick, targetPixel);
            manager.updateNonconfirmedMovement(fullPath, undefined, targetPixel);
            return true;
        }

        // Clicked-on-unit path: unit pursuit
        const clickedUnit = engine.getUnits().find((u) => {
            if (u.id === unit.id || !u.isAlive()) return false;
            const dx = u.x - clampedX;
            const dy = u.y - clampedY;
            return dx * dx + dy * dy <= UNIT_HIT_RADIUS * UNIT_HIT_RADIUS;
        });

        if (clickedUnit) {
            const targetGrid = grid.worldToGrid(clickedUnit.x, clickedUnit.y);
            const fullPath = buildPlayerMovePathThroughWaypoints(
                engine.terrainManager,
                unitGrid.col,
                unitGrid.row,
                [targetGrid],
            );
            if (fullPath === null) return true;
            this.pendingMoveWaypoints = [];
            this.pendingMovePath = fullPath;
            this.pendingMoveTargetUnitId = clickedUnit.id;
            this.pendingMoveTargetPixel = null;
            unit.setMovement(fullPath, clickedUnit.id, engine.gameTick);
            manager.updateNonconfirmedMovement(fullPath, clickedUnit.id, undefined);
            return true;
        }

        const destGrid = grid.worldToGrid(clampedX, clampedY);

        // Shift path: append waypoint
        if (shiftKey) {
            if (this.pendingMoveWaypoints.length >= PLAYER_MOVE_WAYPOINT_MAX) return true;
            const nextWaypoints = [...this.pendingMoveWaypoints, { ...destGrid }];
            const fullPath = buildPlayerMovePathThroughWaypoints(
                engine.terrainManager,
                unitGrid.col,
                unitGrid.row,
                nextWaypoints,
            );
            if (fullPath === null) return true;
            this.pendingMoveWaypoints = nextWaypoints;
            this.pendingMovePath = fullPath;
            this.pendingMoveTargetUnitId = null;
            this.pendingMoveTargetPixel = null;
            unit.setMovement(fullPath, undefined, engine.gameTick);
            manager.updateNonconfirmedMovement(fullPath, undefined, undefined);
            return true;
        }

        // Default path: single-waypoint move
        const waypoints = [{ ...destGrid }];
        const fullPath = buildPlayerMovePathThroughWaypoints(
            engine.terrainManager,
            unitGrid.col,
            unitGrid.row,
            waypoints,
        );
        if (fullPath === null) return true;

        this.pendingMoveWaypoints = waypoints;
        this.pendingMovePath = fullPath;
        this.pendingMoveTargetUnitId = null;
        this.pendingMoveTargetPixel = null;
        unit.setMovement(fullPath, undefined, engine.gameTick);
        manager.updateNonconfirmedMovement(fullPath, undefined, undefined);
        return true;
    }
}
