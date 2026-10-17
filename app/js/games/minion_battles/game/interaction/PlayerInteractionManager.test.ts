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
import { getAbility } from '../../abilities/AbilityRegistry';
import { setAutoEndTurn, getAutoEndTurn } from '../autoEndTurnSetting';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import type { DefaultTool } from './tools/DefaultTool';
import { AbilityTargetingTool } from './tools/AbilityTargetingTool';
import { ensureAbilityRuntimeState } from '../../abilities/abilityUses';
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
                interactiveTargeting: {
                    isActive: false,
                    previewOrderQueued: false,
                    shouldForceItsCommitAtComboWindow: () => false,
                    isResumeMode: false,
                    reset: async () => {},
                    commit: async () => {},
                },
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

        const order = submitted[submitted.length - 1];
        const movePath = order?.movePath;
        expect(order?.abilityId).toBe('wait');
        expect(order?.endTurn).toBe(true);
        expect(movePath?.length).toBeGreaterThan(0);
        expect(movePath?.[movePath.length - 1]).toEqual({ col: 6, row: 4 });
    });

    it('Wait still includes the right-click path if DefaultTool was reset before Space', async () => {
        const { manager, submitted, defaultTool, rightClickToward, engine, unitId } = mountPausedManager();
        rightClickToward(6, 4);
        expect(engine.getUnit(unitId)?.movement?.path.length).toBeGreaterThan(0);

        defaultTool.reset();
        expect(defaultTool.pendingMovePath).toBeNull();

        manager.handleWait();
        await Promise.resolve();

        const order = submitted[submitted.length - 1];
        const movePath = order?.movePath;
        expect(order?.endTurn).toBe(true);
        expect(movePath?.[movePath.length - 1]).toEqual({ col: 6, row: 4 });
    });

    it('Wait confirms a nonconfirmed ability together with the pending move', async () => {
        const { manager, submitted, unitId, rightClickToward } = mountPausedManager();
        manager.submitOrder('test_primary', []);
        await Promise.resolve();
        expect(manager.getUIState().nonconfirmedOrder?.abilityId).toBe('test_primary');

        rightClickToward(5, 4);
        manager.handleWait();
        await Promise.resolve();

        const order = submitted[submitted.length - 1];
        const movePath = order?.movePath;
        expect(order?.unitId).toBe(unitId);
        expect(order?.abilityId).toBe('test_primary');
        expect(order?.endTurn).toBe(true);
        expect(movePath?.[movePath.length - 1]).toEqual({ col: 5, row: 4 });
    });
});

describe('PlayerInteractionManager combo follow-up after assumed ITS pass', () => {
    const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';
    const THROW_ROCK_ABILITY_ID = 'throw_rock';
    let engineToDestroy: GameEngine | null = null;
    let managerToDestroy: PlayerInteractionManager | null = null;

    afterEach(() => {
        managerToDestroy?.destroy();
        managerToDestroy = null;
        engineToDestroy?.destroy();
        engineToDestroy = null;
    });

    function mountComboPauseManager(forceItsCommit: boolean): {
        manager: PlayerInteractionManager;
        player: ReturnType<typeof spawnTinyPlayerUnit>;
        engine: GameEngine;
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
            abilities: [THROW_ROCK_ABILITY_ID, THROW_CHARGED_ROCK_ABILITY_ID],
        });
        player.activeAbilities = [{
            abilityId: THROW_CHARGED_ROCK_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        }];
        engine.waitingForOrders = {
            atTick: engine.gameTick,
            waiters: [{ unitId: player.id, ownerId: TINY_BATTLE_PLAYER_ID }],
        };
        engine.sequentialTargetingPreviewCast = {
            unitId: player.id,
            abilityId: THROW_CHARGED_ROCK_ABILITY_ID,
            startRound: engine.roundNumber, beganAtGameTime: engine.gameTime,
        };

        const camera = new Camera(800, 600, engine.getWorldWidth(), engine.getWorldHeight());
        const manager = new PlayerInteractionManager();
        manager.setContext({
            engine,
            camera,
            renderer: { setDebugUnitOutline: () => {} } as unknown as GameRenderer,
            session: {
                submitPlayerOrder: async () => {},
                interactiveTargeting: {
                    isActive: true,
                    previewOrderQueued: true,
                    shouldForceItsCommitAtComboWindow: () => forceItsCommit,
                    isResumeMode: false,
                    reset: async () => {},
                    commit: async () => {},
                },
            },
            playerId: TINY_BATTLE_PLAYER_ID,
        });
        manager.setCanUseOrderUi(true);
        manager.setMyAbilityIds([THROW_ROCK_ABILITY_ID, THROW_CHARGED_ROCK_ABILITY_ID]);
        manager.setWaitingForOrders(engine.waitingForOrders);
        engineToDestroy = engine;
        managerToDestroy = manager;
        return { manager, player, engine };
    }

    it('ignores combo card clicks when ITS must commit throw 1', () => {
        const { manager } = mountComboPauseManager(true);
        const ability = getAbility(THROW_ROCK_ABILITY_ID);
        expect(ability).toBeDefined();
        manager.activateAbilityTargeting(0, ability!);
        expect(manager.getUIState().selectedCardIndex).toBeNull();
    });

    /**
     * Lobby E27AE2 shape: Charged Rock card (toggled to Basic = Throw Rock) with no Charged Rock
     * uses left, paused on a Throw Rock combo window outside ITS.
     */
    function mountCanonicalThrowRockComboPause(): {
        manager: PlayerInteractionManager;
        submitted: BattleOrder[];
        player: ReturnType<typeof spawnTinyPlayerUnit>;
        rightClickToward: (col: number, row: number) => void;
    } {
        const submitted: BattleOrder[] = [];
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
            abilities: [THROW_CHARGED_ROCK_ABILITY_ID],
        });
        ensureAbilityRuntimeState(player, THROW_CHARGED_ROCK_ABILITY_ID);
        ensureAbilityRuntimeState(player, THROW_ROCK_ABILITY_ID);
        player.abilityRuntime[THROW_CHARGED_ROCK_ABILITY_ID]!.currentUses = 0;
        player.activeAbilities = [{
            abilityId: THROW_ROCK_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        }];
        engine.waitingForOrders = {
            atTick: engine.gameTick + 1,
            waiters: [{ unitId: player.id, ownerId: TINY_BATTLE_PLAYER_ID }],
        };
        const camera = new Camera(800, 600, engine.getWorldWidth(), engine.getWorldHeight());
        const manager = new PlayerInteractionManager();
        manager.setContext({
            engine,
            camera,
            renderer: { setDebugUnitOutline: () => {} } as unknown as GameRenderer,
            session: {
                submitPlayerOrder: async (order: BattleOrder) => {
                    submitted.push(order);
                },
                interactiveTargeting: {
                    isActive: false,
                    previewOrderQueued: false,
                    shouldForceItsCommitAtComboWindow: () => false,
                    isResumeMode: false,
                    reset: async () => {},
                    commit: async () => {},
                },
            },
            playerId: TINY_BATTLE_PLAYER_ID,
        });
        manager.setCanUseOrderUi(true);
        manager.setMyAbilityIds([THROW_CHARGED_ROCK_ABILITY_ID]);
        manager.setWaitingForOrders(engine.waitingForOrders);
        engineToDestroy = engine;
        managerToDestroy = manager;
        camera.x = player.x;
        camera.y = player.y;
        const rightClickToward = (col: number, row: number): void => {
            const dest = playerCellCenter(col, row);
            const screen = camera.worldToScreen(dest.x, dest.y);
            manager.onCanvasRightClick(screen.x, screen.y, false, false);
        };
        return { manager, submitted, player, rightClickToward };
    }

    it('right-click at the combo window plans a move without submitting (an order would resolve the pause)', () => {
        const { submitted, player, rightClickToward } = mountCanonicalThrowRockComboPause();

        rightClickToward(6, 4);

        expect(submitted).toHaveLength(0);
        expect(player.movement?.path.length ?? 0).toBeGreaterThan(0);
        expect(player.activeAbilities[0]?.conditionalCancelPaused).toBe(true);
    });

    it('Pass at the combo window carries the right-click move', async () => {
        const { manager, submitted, rightClickToward } = mountCanonicalThrowRockComboPause();

        rightClickToward(6, 4);
        manager.handleWait();
        await Promise.resolve();

        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({ abilityId: 'wait', endTurn: true });
        expect(submitted[0]!.movePath?.at(-1)).toEqual({ col: 6, row: 4 });
    });

    it('combo card at the combo window carries the right-click move', async () => {
        const { manager, submitted, rightClickToward } = mountCanonicalThrowRockComboPause();

        rightClickToward(6, 4);
        manager.activateAbilityTargeting(0, getAbility(THROW_ROCK_ABILITY_ID)!);
        await Promise.resolve();

        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({ abilityId: THROW_ROCK_ABILITY_ID });
        expect(submitted[0]!.movePath?.at(-1)).toEqual({ col: 6, row: 4 });
    });

    it('combo card click (Basic mode = Throw Rock) routes into ITS, not the upfront targeting tool', async () => {
        const { manager, submitted } = mountCanonicalThrowRockComboPause();

        manager.activateAbilityTargeting(0, getAbility(THROW_ROCK_ABILITY_ID)!);
        await Promise.resolve();

        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({ abilityId: THROW_ROCK_ABILITY_ID, targets: [] });
        expect(manager.getUIState().selectedAbility).toBeNull();
    });

    it('ignores the card in Charged mode when Charged Rock has no uses left', async () => {
        const { manager, submitted } = mountCanonicalThrowRockComboPause();

        manager.activateAbilityTargeting(0, getAbility(THROW_CHARGED_ROCK_ABILITY_ID)!);
        await Promise.resolve();

        expect(submitted).toHaveLength(0);
        expect(manager.getUIState().selectedAbility).toBeNull();
    });

    it('clicking the same card after a mode flip switches ability instead of toggling off', async () => {
        const { manager, submitted, player } = mountCanonicalThrowRockComboPause();
        player.abilityRuntime[THROW_CHARGED_ROCK_ABILITY_ID]!.currentUses = 1;
        manager.activateTool(new AbilityTargetingTool(getAbility(THROW_CHARGED_ROCK_ABILITY_ID)!, 0, player.id));
        expect(manager.getUIState().selectedCardIndex).toBe(0);

        manager.activateAbilityTargeting(0, getAbility(THROW_ROCK_ABILITY_ID)!);
        await Promise.resolve();

        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({ abilityId: THROW_ROCK_ABILITY_ID });
        expect(manager.getUIState().selectedAbility).toBeNull();
    });

    it('Wait at the combo window commits throw 1 only after an assumed pass', async () => {
        const commit = vi.fn(async () => {});
        const submitted: BattleOrder[] = [];
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
            abilities: [THROW_ROCK_ABILITY_ID],
        });
        player.activeAbilities = [{
            abilityId: THROW_CHARGED_ROCK_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        }];
        engine.waitingForOrders = {
            atTick: engine.gameTick,
            waiters: [{ unitId: player.id, ownerId: TINY_BATTLE_PLAYER_ID }],
        };
        engine.sequentialTargetingPreviewCast = {
            unitId: player.id,
            abilityId: THROW_CHARGED_ROCK_ABILITY_ID,
            startRound: engine.roundNumber, beganAtGameTime: engine.gameTime,
        };
        const camera = new Camera(800, 600, engine.getWorldWidth(), engine.getWorldHeight());
        const manager = new PlayerInteractionManager();
        manager.setContext({
            engine,
            camera,
            renderer: { setDebugUnitOutline: () => {} } as unknown as GameRenderer,
            session: {
                submitPlayerOrder: async (order: BattleOrder) => {
                    submitted.push(order);
                },
                interactiveTargeting: {
                    isActive: true,
                    previewOrderQueued: true,
                    shouldForceItsCommitAtComboWindow: () => true,
                    isResumeMode: false,
                    reset: async () => {},
                    commit,
                },
            },
            playerId: TINY_BATTLE_PLAYER_ID,
        });
        manager.setCanUseOrderUi(true);
        manager.setWaitingForOrders(engine.waitingForOrders);
        engineToDestroy = engine;
        managerToDestroy = manager;

        manager.handleWait();
        await Promise.resolve();

        expect(commit).toHaveBeenCalledTimes(1);
        expect(submitted).toHaveLength(0);
    });
});

describe('PlayerInteractionManager at a missing-pick decision', () => {
    let engineToDestroy: GameEngine | null = null;
    let managerToDestroy: PlayerInteractionManager | null = null;

    afterEach(() => {
        managerToDestroy?.destroy();
        managerToDestroy = null;
        engineToDestroy?.destroy();
        engineToDestroy = null;
    });

    function mountMissingPick(opts: { awaiting: boolean; resumeActive: boolean }) {
        const submitted: BattleOrder[] = [];
        const reset = vi.fn(async () => {});
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
        player.activeAbilities = [{
            abilityId: '0120',
            startTime: engine.gameTime,
            targets: [],
            ...(opts.awaiting ? { awaitingPickLabel: 'Target 1', missingSelectLabels: ['Target 1'] } : {}),
        } as never];
        engine.waitingForOrders = {
            atTick: engine.gameTick,
            waiters: [{ unitId: player.id, ownerId: TINY_BATTLE_PLAYER_ID }],
        };
        const camera = new Camera(800, 600, engine.getWorldWidth(), engine.getWorldHeight());
        const manager = new PlayerInteractionManager();
        manager.setContext({
            engine,
            camera,
            renderer: { setDebugUnitOutline: () => {} } as unknown as GameRenderer,
            session: {
                submitPlayerOrder: async (order: BattleOrder) => {
                    submitted.push(order);
                },
                interactiveTargeting: {
                    isActive: opts.resumeActive,
                    isResumeMode: opts.resumeActive,
                    previewOrderQueued: opts.resumeActive,
                    shouldForceItsCommitAtComboWindow: () => false,
                    commit: async () => {},
                    reset,
                },
            },
            playerId: TINY_BATTLE_PLAYER_ID,
        });
        manager.setCanUseOrderUi(true);
        manager.setWaitingForOrders(engine.waitingForOrders);
        manager.setMyAbilityIds(['0120']);
        engineToDestroy = engine;
        managerToDestroy = manager;
        return { manager, submitted, reset, player };
    }

    const digitKey = (): KeyboardEvent =>
        ({ code: 'Digit1', key: '1', repeat: false, preventDefault: () => {} }) as unknown as KeyboardEvent;

    it('Pass resets the resume preview and submits wait for the batch', async () => {
        const { manager, submitted, reset, player } = mountMissingPick({ awaiting: true, resumeActive: true });

        manager.handleWait();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(reset).toHaveBeenCalledTimes(1);
        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({ unitId: player.id, abilityId: 'wait', endTurn: true });
    });

    it('Pass works before the resume preview is armed (no ITS yet)', async () => {
        const { manager, submitted } = mountMissingPick({ awaiting: true, resumeActive: false });

        manager.handleWait();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({ abilityId: 'wait', endTurn: true });
    });

    it('ability hotkeys and cards are ignored', async () => {
        const { manager, submitted } = mountMissingPick({ awaiting: true, resumeActive: true });
        const activate = vi.spyOn(manager, 'activateAbilityTargeting');

        manager.onKeyDown(digitKey());
        manager.activateAbilityTargeting(0, getAbility('0120')!);
        await Promise.resolve();

        // The hotkey never reached activateAbilityTargeting; the direct call returned without acting.
        expect(activate).toHaveBeenCalledTimes(1);
        expect(submitted).toHaveLength(0);
        expect(manager.getUIState().selectedAbility).toBeNull();
    });

    it('ability hotkeys still work when no cast is waiting on a pick', () => {
        const { manager } = mountMissingPick({ awaiting: false, resumeActive: false });
        const activate = vi.spyOn(manager, 'activateAbilityTargeting').mockImplementation(() => {});

        manager.onKeyDown(digitKey());

        expect(activate).toHaveBeenCalledTimes(1);
    });
});

describe('PlayerInteractionManager Pass at an ended-early preview stop (Undo allowed)', () => {
    let engineToDestroy: GameEngine | null = null;
    let managerToDestroy: PlayerInteractionManager | null = null;

    afterEach(() => {
        managerToDestroy?.destroy();
        managerToDestroy = null;
        engineToDestroy?.destroy();
        engineToDestroy = null;
    });

    /** ITS preview whose cast ended early and has reached its stop (the caster can act again). */
    function mountEndedEarlyDone(opts: { endedEarly: boolean }) {
        const commit = vi.fn(async (_session: unknown, _actionSource?: string) => {});
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
        engine.waitingForOrders = null;
        engine.isSequentialTargetingPreview = true;
        engine.sequentialTargetingPreviewCast = {
            unitId: player.id,
            abilityId: '0120',
            startRound: engine.roundNumber,
            beganAtGameTime: engine.gameTime,
            ...(opts.endedEarly ? { endedEarly: { atTick: engine.gameTick, reason: 'interrupted' as const } } : {}),
        };
        const camera = new Camera(800, 600, engine.getWorldWidth(), engine.getWorldHeight());
        const manager = new PlayerInteractionManager();
        manager.setContext({
            engine,
            camera,
            renderer: { setDebugUnitOutline: () => {} } as unknown as GameRenderer,
            session: {
                submitPlayerOrder: async () => {},
                interactiveTargeting: {
                    isActive: true,
                    isResumeMode: false,
                    previewOrderQueued: true,
                    shouldForceItsCommitAtComboWindow: () => false,
                    commit,
                    reset: async () => {},
                    getPreviewCastEndedEarly: () => (opts.endedEarly ? { reason: 'interrupted' } : null),
                },
            },
            playerId: TINY_BATTLE_PLAYER_ID,
        });
        // No active order waiter during the preview, so the order UI is off.
        manager.setCanUseOrderUi(false);
        engineToDestroy = engine;
        managerToDestroy = manager;
        return { manager, commit };
    }

    const spaceKey = (): KeyboardEvent =>
        ({ code: 'Space', key: ' ', repeat: false, preventDefault: () => {} }) as unknown as KeyboardEvent;

    it('the Pass button commits the ended-early timeline', () => {
        const { manager, commit } = mountEndedEarlyDone({ endedEarly: true });
        manager.handleWait();
        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit.mock.calls[0]![1]).toBe('pass_ended_early');
    });

    it('Space commits it too, even though the order UI is off', () => {
        const { manager, commit } = mountEndedEarlyDone({ endedEarly: true });
        manager.onKeyDown(spaceKey());
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('Pass does nothing during an ordinary preview that did not end early', () => {
        const { manager, commit } = mountEndedEarlyDone({ endedEarly: false });
        manager.handleWait();
        manager.onKeyDown(spaceKey());
        expect(commit).not.toHaveBeenCalled();
    });
});
