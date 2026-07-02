/**
 * Mid-ability conditional cancel: pause on interval exit, wait resumes cast, coop cancel suppressed.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { Unit } from './units/Unit';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import { getAbilityTagsForId } from '../abilities/Ability';
import { computeAbilityModifiersFromResearch } from '../../../researchTrees/evaluator';
import {
    EARTH_TREE_ID,
    EARTH_NODE_ROCK_SYNERGY_ENTOMBED,
} from '../../../researchTrees/trees/earth';
import { getAbility } from '../abilities/AbilityRegistry';
import {
    AbilityPhase,
    getCoveringAbilityPhaseAtElapsed,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../abilities/abilityTimings';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { runScenarioHeadless } from '../testing/runner/SimulationRunner';
import { earthCoreDiggingClawsScenario } from '../testing/scenarios/abilities/earthCoreScenarios';
import { Movement } from '../resources/Movement';

type EnginePrivatePauseTest = {
    deferredOrderPause: {
        waiters: import('./types').OrderWaiter[];
        naturalCompletionUnitIds: readonly string[];
    } | null;
    commitDeferredOrderPauseAfterCompletedTick(): boolean;
    waitingForOrders: import('./types').WaitingForOrders | null;
};

describe('conditional cancel', () => {
    it('toJSON serializes conditionalCancelPaused on the active ability, not on waitingForOrders', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.waitingForOrders = {
            waiters: [{ unitId: 'unit_1', ownerId: 'p1' }],
            atTick: 12,
        };

        const json = engine.toJSON();
        expect(json.waitingForOrders).toEqual({
            waiters: [{ unitId: 'unit_1', ownerId: 'p1' }],
            atTick: 12,
        });
        expect((json.waitingForOrders as unknown as Record<string, unknown>)?.conditionalCancelContext).toBeUndefined();

        engine.destroy();
    });

    it('suppresses coop cancel when conditionalCancelContext is present', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        const col = 6;
        const row = 6;
        const unitP1 = new Unit({
            id: 'unit_p1',
            x: col * CELL_SIZE + CELL_SIZE / 2,
            y: row * CELL_SIZE + CELL_SIZE / 2,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            portraitId: 'warrior',
            name: 'P1',
            abilities: ['0534'],
        });
        const unitP2 = new Unit({
            id: 'unit_p2',
            x: (col + 2) * CELL_SIZE + CELL_SIZE / 2,
            y: row * CELL_SIZE + CELL_SIZE / 2,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p2',
            characterId: 'player',
            portraitId: 'ranger',
            name: 'P2',
            abilities: ['0533'],
        });
        engine.addUnit(unitP1);
        engine.addUnit(unitP2);
        initializeAbilityRuntimeForUnit(unitP1);
        initializeAbilityRuntimeForUnit(unitP2);

        engine.gameTick = 10;
        engine.gameTime = 20;
        unitP1.activeAbilities = [
            {
                abilityId: '0534',
                startTime: engine.gameTime - 0.39,
                targets: [{ type: 'pixel', position: { x: unitP1.x + 40, y: unitP1.y } }],
            },
        ];
        unitP2.activeAbilities = [
            {
                abilityId: '0533',
                startTime: engine.gameTime - 1.0,
                targets: [{ type: 'pixel', position: { x: unitP2.x + 40, y: unitP2.y } }],
            },
        ];

        // Mark the active ability as conditional-cancel-paused so the engine detects it
        unitP1.activeAbilities[0]!.conditionalCancelPaused = true;

        const eng = engine as unknown as EnginePrivatePauseTest;
        eng.deferredOrderPause = {
            waiters: [{ unitId: 'unit_p1', ownerId: 'p1' }],
            naturalCompletionUnitIds: ['unit_p1'],
        };

        expect(eng.commitDeferredOrderPauseAfterCompletedTick()).toBe(true);
        expect(unitP1.activeAbilities.length).toBe(1);
        expect(unitP2.activeAbilities.length).toBe(1);
        // Conditional cancel suppresses coop cancel — only unit_p1 should be a waiter
        expect(engine.waitingForOrders?.waiters.some((w) => w.unitId === 'unit_p1')).toBe(true);
        expect(engine.waitingForOrders?.teamworkCancelledOwnerIds).toBeUndefined();

        engine.destroy();
    });

    it('wait order resumes a paused cast without turn wait lockout', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        for (let col = 4; col <= 5; col++) {
            for (let row = 2; row <= 7; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }
        placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['0534'],
        });

        const player = engine.getLocalPlayerUnit()!;
        player.attachResource(new Movement(), engine.eventBus);
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0534',
            targets: [{ type: 'pixel', position: { x: 5 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 } }],
        });

        let pausedWithContext = false;
        for (let i = 0; i < 120; i++) {
            if (player.activeAbilities.some((a) => a.conditionalCancelPaused)) {
                pausedWithContext = true;
                engine.state.orderMgr.applyOrder({ unitId: player.id, abilityId: 'wait', targets: [], endTurn: true });
                break;
            }
            engine.stepSimulationFixedTicks(1);
        }

        expect(pausedWithContext).toBe(true);
        expect(player.activeAbilities.some((a) => a.abilityId === '0534')).toBe(true);
        expect(player.activeAbilities[0]?.conditionalCancelPaused).toBe(false);

        for (let i = 0; i < 180; i++) {
            engine.stepSimulationFixedTicks(1);
            if (player.activeAbilities.length === 0) break;
        }

        expect(player.isInWaitLockout()).toBe(false);
        expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(true);

        engine.destroy();
    });

    it('rejects ability orders that fail the tag filter during conditional cancel', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        const unit = new Unit({
            id: 'unit_p1',
            x: 100,
            y: 100,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            portraitId: 'warrior',
            name: 'P1',
            abilities: ['0534', '0120'],
        });
        engine.addUnit(unit);
        initializeAbilityRuntimeForUnit(unit);
        unit.activeAbilities = [
            {
                abilityId: '0534',
                startTime: 0,
                targets: [{ type: 'pixel', position: { x: 140, y: 100 } }],
                conditionalCancelPaused: true,
                conditionalCancelTagFilter: ['Entombed'],
            },
        ];

        engine.gameTick = 5;
        engine.waitingForOrders = {
            waiters: [{ unitId: 'unit_p1', ownerId: 'p1' }],
            atTick: 6,
        };
        engine.isPaused = true;

        engine.state.orderMgr.applyOrder({
            unitId: 'unit_p1',
            abilityId: '0120',
            targets: [{ type: 'pixel', position: { x: 140, y: 100 } }],
        });

        expect(engine.state.orderMgr.hasPendingOrderForUnit('unit_p1', 6)).toBe(false);
        expect(unit.activeAbilities.some((a) => a.abilityId === '0534')).toBe(true);

        engine.destroy();
    });

    it('earth core digging claws scenario still passes with auto-wait resume', () => {
        const result = runScenarioHeadless(earthCoreDiggingClawsScenario);
        expect(result.passed, result.message).toBe(true);
    });

    it('re-casting digging claws during conditional cancel dashes toward the new target instead of slingshotting', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const rockStartCol = 5;
        const rockLeftX = rockStartCol * CELL_SIZE;
        for (let col = rockStartCol; col <= 6; col++) {
            for (let row = 2; row <= 8; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }
        const targetInRock = {
            x: rockStartCol * CELL_SIZE + CELL_SIZE / 2,
            y: 5 * CELL_SIZE + CELL_SIZE / 2,
        };
        placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['0534'],
        });

        const player = engine.getLocalPlayerUnit()!;
        player.attachResource(new Movement(), engine.eventBus);
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0534',
            targets: [{ type: 'pixel', position: targetInRock }],
        });

        let pauseY: number | null = null;
        let retargetPos: { x: number; y: number } | null = null;
        for (let i = 0; i < 120; i++) {
            if (player.activeAbilities.some((a) => a.conditionalCancelPaused)) {
                pauseY = player.y;
                expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(false);
                retargetPos = { x: player.x, y: player.y - 100 };
                engine.state.orderMgr.applyOrder({
                    unitId: player.id,
                    abilityId: '0534',
                    targets: [{ type: 'pixel', position: retargetPos }],
                    endTurn: true,
                });
                break;
            }
            engine.stepSimulationFixedTicks(1);
        }

        expect(pauseY).not.toBeNull();
        for (let i = 0; i < 3; i++) {
            engine.stepSimulationFixedTicks(1);
        }

        const active = player.activeAbilities[0];
        expect(active?.abilityId).toBe('0534');
        expect(active?.conditionalCancelPaused).toBeFalsy();
        expect(active?.targets[0]).toEqual({ type: 'pixel', position: retargetPos });

        const yAfterRetarget = player.y;
        for (let i = 0; i < 36; i++) {
            engine.stepSimulationFixedTicks(1);
        }

        expect(player.y).toBeLessThan(yAfterRetarget - 10);
        expect(player.x).toBeGreaterThanOrEqual(rockLeftX - 5);

        engine.destroy();
    });

    it('Entomb Chain (Digging Claws & Throw Rock) ejects from rock during throw rock cooldown', () => {
        resetGameObjectIdCounter(1);
        const researchByPlayer = {
            [TINY_BATTLE_PLAYER_ID]: { [EARTH_TREE_ID]: [EARTH_NODE_ROCK_SYNERGY_ENTOMBED] },
        };
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
            playerResearchTreesByPlayer: researchByPlayer,
        });
        const rockStartCol = 5;
        const targetInRock = {
            x: rockStartCol * CELL_SIZE + CELL_SIZE / 2,
            y: 5 * CELL_SIZE + CELL_SIZE / 2,
        };
        for (let col = rockStartCol; col <= 6; col++) {
            for (let row = 2; row <= 8; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }
        const { dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['0534', 'throw_rock'],
            playerResearchTreesByPlayer: researchByPlayer,
        });
        const player = engine.getLocalPlayerUnit()!;
        player.abilityModifiers = computeAbilityModifiersFromResearch(
            researchByPlayer[TINY_BATTLE_PLAYER_ID],
            getAbilityTagsForId,
            player.abilities,
        );
        player.attachResource(new Movement(), engine.eventBus);

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0534',
            targets: [{ type: 'pixel', position: targetInRock }],
        });

        let throwRockSubmitted = false;
        let throwRockWaitSubmitted = false;
        let ejectedDuringThrowRockCooldown = false;
        let ticksInRockDuringThrowRockCooldown = 0;

        for (let i = 0; i < 400; i++) {
            const paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
            if (paused) {
                if (paused.abilityId === '0534' && !throwRockSubmitted) {
                    engine.state.orderMgr.applyOrder({
                        unitId: player.id,
                        abilityId: 'throw_rock',
                        targets: [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }],
                        endTurn: true,
                    });
                    throwRockSubmitted = true;
                } else if (paused.abilityId === 'throw_rock' && throwRockSubmitted && !throwRockWaitSubmitted) {
                    engine.state.orderMgr.applyOrder({
                        unitId: player.id,
                        abilityId: 'wait',
                        targets: [],
                        endTurn: true,
                    });
                    throwRockWaitSubmitted = true;
                }
            }

            const throwRockActive = player.activeAbilities.find((a) => a.abilityId === 'throw_rock');
            const tm = engine.terrainManager!;
            if (throwRockActive) {
                const ability = getAbility('throw_rock')!;
                const intervals = normalizeAbilityTimingsToIntervals(
                    resolveAbilityTimingEntries(ability, player, engine),
                );
                const elapsed = engine.gameTime - throwRockActive.startTime;
                const phase = getCoveringAbilityPhaseAtElapsed(elapsed, intervals);
                if (phase === AbilityPhase.Cooldown) {
                    if (!tm.isPassable(player.x, player.y)) {
                        ticksInRockDuringThrowRockCooldown++;
                    } else {
                        ejectedDuringThrowRockCooldown = true;
                    }
                }
            }

            if (throwRockSubmitted && tm.isPassable(player.x, player.y) && !player.activeAbilities.some((a) => a.abilityId === 'throw_rock')) {
                break;
            }

            engine.stepSimulationFixedTicks(1);
        }

        expect(throwRockSubmitted).toBe(true);
        expect(ejectedDuringThrowRockCooldown).toBe(true);
        expect(ticksInRockDuringThrowRockCooldown).toBeLessThan(15);
        expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(true);

        engine.destroy();
    });

    it('generic wall eject runs while entombed throw rock is in cooldown phase', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        for (let col = 4; col <= 5; col++) {
            for (let row = 2; row <= 7; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }
        const { player } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 8 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['throw_rock'],
        });
        player.abilityModifiers = { throw_rock: { addTags: ['Entombed'] } };
        player.x = 4 * CELL_SIZE + CELL_SIZE / 2;
        player.y = 5 * CELL_SIZE + CELL_SIZE / 2;
        player.wallEntryPoint = { x: 3 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 };
        player.activeAbilities = [
            {
                abilityId: 'throw_rock',
                startTime: engine.gameTime - 1.05,
                targets: [{ type: 'pixel', position: { x: player.x + 80, y: player.y } }],
            },
        ];

        for (let i = 0; i < 30; i++) {
            engine.stepSimulationFixedTicks(1);
            if (engine.terrainManager!.isPassable(player.x, player.y)) break;
        }

        expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(true);
        engine.destroy();
    });

    it('throw rock triggers conditional cancel pause while inside rock, then can take a turn', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Rock block around the player.
        for (let col = 4; col <= 5; col++) {
            for (let row = 2; row <= 7; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }

        const { dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 8 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['throw_rock'],
        });

        const player = engine.getLocalPlayerUnit()!;
        player.abilityModifiers = { throw_rock: { addTags: ['Entombed'] } };
        player.wallEntryPoint = { x: 3 * CELL_SIZE + CELL_SIZE / 2, y: player.y };

        // Start close to the end of the base `active` band, so conditional cancel fires on interval exit.
        player.activeAbilities = [
            {
                abilityId: 'throw_rock',
                startTime: engine.gameTime - 0.39,
                targets: [{ type: 'pixel', position: { x: dummy.x, y: player.y } }],
            },
        ];

        // Step until conditional-cancel pause triggers.
        for (let i = 0; i < 120; i++) {
            engine.stepSimulationFixedTicks(1);
            if (engine.waitingForOrders != null && player.activeAbilities.some((a) => a.conditionalCancelPaused)) {
                break;
            }
        }

        const paused = player.activeAbilities.find((a) => a.abilityId === 'throw_rock');
        expect(engine.waitingForOrders).not.toBeNull();
        expect(paused?.conditionalCancelPaused).toBe(true);
        expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(false);

        // Resume cast via `wait` (does not require eligible Entombed ability selection).
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            endTurn: true,
        });

        // Step until cast finishes and the engine pauses normally for player orders.
        for (let i = 0; i < 300; i++) {
            engine.stepSimulationFixedTicks(1);
            if (
                engine.waitingForOrders != null &&
                engine.state.orderMgr.getActiveOrderWaiterForPlayer(TINY_BATTLE_PLAYER_ID) != null &&
                player.canAct()
            ) {
                break;
            }
        }

        expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(true);
        expect(player.canAct()).toBe(true);
        expect(engine.state.orderMgr.getActiveOrderWaiterForPlayer(TINY_BATTLE_PLAYER_ID)).not.toBeNull();

        engine.destroy();
    });

    it('after slingshot ejects player, game pauses for player orders', () => {
        resetGameObjectIdCounter(1);
        const researchByPlayer = {
            [TINY_BATTLE_PLAYER_ID]: { [EARTH_TREE_ID]: [EARTH_NODE_ROCK_SYNERGY_ENTOMBED] },
        };
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
            playerResearchTreesByPlayer: researchByPlayer,
        });
        const rockStartCol = 5;
        const targetInRock = {
            x: rockStartCol * CELL_SIZE + CELL_SIZE / 2,
            y: 5 * CELL_SIZE + CELL_SIZE / 2,
        };
        for (let col = rockStartCol; col <= 6; col++) {
            for (let row = 2; row <= 8; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }
        const { dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['0534', 'throw_rock'],
            playerResearchTreesByPlayer: researchByPlayer,
        });
        const player = engine.getLocalPlayerUnit()!;
        player.abilityModifiers = computeAbilityModifiersFromResearch(
            researchByPlayer[TINY_BATTLE_PLAYER_ID],
            getAbilityTagsForId,
            player.abilities,
        );
        player.attachResource(new Movement(), engine.eventBus);

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0534',
            targets: [{ type: 'pixel', position: targetInRock }],
        });

        // Step until conditional cancel pause fires and submit throw_rock
        let throwRockSubmitted = false;
        let throwRockWaitSubmitted = false;
        for (let i = 0; i < 300; i++) {
            const paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
            if (paused) {
                if (paused.abilityId === '0534' && !throwRockSubmitted) {
                    engine.state.orderMgr.applyOrder({
                        unitId: player.id,
                        abilityId: 'throw_rock',
                        targets: [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }],
                        endTurn: true,
                    });
                    throwRockSubmitted = true;
                } else if (paused.abilityId === 'throw_rock' && !throwRockWaitSubmitted) {
                    engine.state.orderMgr.applyOrder({
                        unitId: player.id,
                        abilityId: 'wait',
                        targets: [],
                        endTurn: true,
                    });
                    throwRockWaitSubmitted = true;
                }
            }
            // Stop once game pauses for a regular (non-conditional-cancel) order
            if (engine.waitingForOrders != null) {
                const isConditionalCancel = engine.waitingForOrders.waiters.some((w) =>
                    engine.getUnit(w.unitId)?.activeAbilities.some((a) => a.conditionalCancelPaused),
                );
                if (!isConditionalCancel) break;
            }
            engine.stepSimulationFixedTicks(1);
        }

        expect(throwRockSubmitted).toBe(true);
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.state.orderMgr.getActiveOrderWaiterForPlayer(TINY_BATTLE_PLAYER_ID)).not.toBeNull();
        expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(true);

        engine.destroy();
    });

    it('queueOrder path (applyRemoteOrders) cancels digging claws before throw rock runs', () => {
        resetGameObjectIdCounter(1);
        const researchByPlayer = {
            [TINY_BATTLE_PLAYER_ID]: { [EARTH_TREE_ID]: [EARTH_NODE_ROCK_SYNERGY_ENTOMBED] },
        };
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
            playerResearchTreesByPlayer: researchByPlayer,
        });
        const rockStartCol = 5;
        const targetInRock = {
            x: rockStartCol * CELL_SIZE + CELL_SIZE / 2,
            y: 5 * CELL_SIZE + CELL_SIZE / 2,
        };
        for (let col = rockStartCol; col <= 6; col++) {
            for (let row = 2; row <= 8; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }
        const { dummy } = placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['0534', 'throw_rock'],
            playerResearchTreesByPlayer: researchByPlayer,
        });
        const player = engine.getLocalPlayerUnit()!;
        player.abilityModifiers = computeAbilityModifiersFromResearch(
            researchByPlayer[TINY_BATTLE_PLAYER_ID],
            getAbilityTagsForId,
            player.abilities,
        );
        player.attachResource(new Movement(), engine.eventBus);

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0534',
            targets: [{ type: 'pixel', position: targetInRock }],
        });

        let pauseAtTick: number | null = null;
        for (let i = 0; i < 120; i++) {
            if (player.activeAbilities.some((a) => a.conditionalCancelPaused)) {
                pauseAtTick = engine.gameTick + 1;
                break;
            }
            engine.stepSimulationFixedTicks(1);
        }
        expect(pauseAtTick).not.toBeNull();

        // Host BattleNet path: applyRemoteOrders → queueOrder (not applyOrder).
        engine.state.orderMgr.queueOrder(pauseAtTick!, {
            unitId: player.id,
            abilityId: 'throw_rock',
            targets: [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }],
            endTurn: true,
        });
        engine.tryResumeParallel();

        let throwRockWaitSubmitted = false;
        for (let i = 0; i < 400; i++) {
            const paused = player.activeAbilities.find((a) => a.conditionalCancelPaused);
            if (
                engine.waitingForOrders != null &&
                paused?.abilityId === 'throw_rock' &&
                !throwRockWaitSubmitted
            ) {
                engine.state.orderMgr.applyOrder({
                    unitId: player.id,
                    abilityId: 'wait',
                    targets: [],
                    endTurn: true,
                });
                throwRockWaitSubmitted = true;
            }
            engine.stepSimulationFixedTicks(1);
            if (
                engine.waitingForOrders != null
                && engine.state.orderMgr.getActiveOrderWaiterForPlayer(TINY_BATTLE_PLAYER_ID) != null
                && player.canAct()
            ) {
                break;
            }
        }

        expect(player.activeAbilities.some((a) => a.abilityId === '0534')).toBe(false);
        expect(player.activeAbilities.some((a) => a.conditionalCancelPaused)).toBe(false);
        expect(engine.state.orderMgr.getActiveOrderWaiterForPlayer(TINY_BATTLE_PLAYER_ID)).not.toBeNull();

        engine.destroy();
    });
});
