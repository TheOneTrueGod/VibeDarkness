/**
 * Wait / Space must confirm whatever client-side plan is already on the unit
 * (right-click move, nonconfirmed ability), even if DefaultTool was reset in between.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./itsLobbyLog', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./itsLobbyLog')>();
    return {
        ...actual,
        logOrderUiKeyAction: vi.fn(),
    };
});

import { PlayerInteractionManager } from './PlayerInteractionManager';
import { Camera } from '../Camera';
import type { GameRenderer } from '../GameRenderer/GameRenderer';
import type { BattleOrder } from '../types';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { setAutoEndTurn, getAutoEndTurn } from '../autoEndTurnSetting';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import type { DefaultTool } from './tools/DefaultTool';
import type { GameEngine } from '../GameEngine';

const GRID_W = 10;
const GRID_H = 8;

function playerCellCenter(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

describe('PlayerInteractionManager wait confirms client-side move', () => {
    let previousAutoEndTurn: boolean;
    let engineToDestroy: GameEngine | null = null;
    let managerToDestroy: PlayerInteractionManager | null = null;

    beforeEach(() => {
        previousAutoEndTurn = getAutoEndTurn();
        setAutoEndTurn(false);
    });

    afterEach(() => {
        setAutoEndTurn(previousAutoEndTurn);
        managerToDestroy?.destroy();
        managerToDestroy = null;
        engineToDestroy?.destroy();
        engineToDestroy = null;
    });

    function mountPausedManager(): {
        engine: ReturnType<typeof buildTinyBattleEngine>;
        playerId: typeof TINY_BATTLE_PLAYER_ID;
        unitId: string;
        manager: PlayerInteractionManager;
        submitted: BattleOrder[];
        rightClickToward: (col: number, row: number) => void;
        defaultTool: DefaultTool;
    } {
        const engine = buildTinyBattleEngine({
            gridW: GRID_W,
            gridH: GRID_H,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const start = playerCellCenter(2, 4);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: start.x,
            y: start.y,
            abilities: ['0120'],
        });

        engine.waitingForOrders = {
            atTick: engine.gameTick,
            waiters: [{ unitId: player.id, ownerId: TINY_BATTLE_PLAYER_ID }],
        };

        const camera = new Camera(
            800,
            600,
            engine.getWorldWidth(),
            engine.getWorldHeight(),
        );
        camera.x = player.x;
        camera.y = player.y;

        const submitted: BattleOrder[] = [];
        const manager = new PlayerInteractionManager();
        manager.setContext({
            engine,
            camera,
            renderer: { setDebugUnitOutline: () => {} } as unknown as GameRenderer,
            session: {
                submitPlayerOrder: async (order: BattleOrder) => {
                    submitted.push({ ...order, movePath: order.movePath ? [...order.movePath] : order.movePath });
                    engine.state.orderMgr.applyOrder(order);
                },
                interactiveTargeting: { isActive: false },
            },
            playerId: TINY_BATTLE_PLAYER_ID,
        });
        manager.setCanUseOrderUi(true);
        manager.setWaitingForOrders(engine.waitingForOrders);

        engineToDestroy = engine;
        managerToDestroy = manager;

        const defaultTool = (manager as unknown as { defaultTool: DefaultTool }).defaultTool;

        return {
            engine,
            playerId: TINY_BATTLE_PLAYER_ID,
            unitId: player.id,
            manager,
            submitted,
            defaultTool,
            rightClickToward(col: number, row: number) {
                const dest = playerCellCenter(col, row);
                const screen = camera.worldToScreen(dest.x, dest.y);
                manager.onCanvasRightClick(screen.x, screen.y, false, false);
            },
        };
    }

    it('Space/wait after a right-click move submits wait with that path and endTurn', async () => {
        const { manager, submitted, rightClickToward } = mountPausedManager();
        rightClickToward(6, 4);
        manager.handleWait();
        await Promise.resolve();

        const order = submitted.at(-1);
        expect(order?.abilityId).toBe('wait');
        expect(order?.endTurn).toBe(true);
        expect(order?.movePath?.length).toBeGreaterThan(0);
        expect(order?.movePath?.at(-1)).toEqual({ col: 6, row: 4 });
    });

    it('Wait still includes the right-click path if DefaultTool was reset before Space', async () => {
        const { manager, submitted, defaultTool, rightClickToward, engine, unitId } = mountPausedManager();
        rightClickToward(6, 4);
        expect(engine.getUnit(unitId)?.movement?.path.length).toBeGreaterThan(0);

        defaultTool.reset();
        expect(defaultTool.pendingMovePath).toBeNull();

        manager.handleWait();
        await Promise.resolve();

        const order = submitted.at(-1);
        expect(order?.endTurn).toBe(true);
        expect(order?.movePath?.at(-1)).toEqual({ col: 6, row: 4 });
    });

    it('Wait confirms a nonconfirmed ability together with the pending move', async () => {
        const { manager, submitted, unitId, rightClickToward } = mountPausedManager();
        manager.submitOrder('test_primary', []);
        await Promise.resolve();
        expect(manager.getUIState().nonconfirmedOrder?.abilityId).toBe('test_primary');

        rightClickToward(5, 4);
        manager.handleWait();
        await Promise.resolve();

        const order = submitted.at(-1);
        expect(order?.unitId).toBe(unitId);
        expect(order?.abilityId).toBe('test_primary');
        expect(order?.endTurn).toBe(true);
        expect(order?.movePath?.at(-1)).toEqual({ col: 5, row: 4 });
    });
});
