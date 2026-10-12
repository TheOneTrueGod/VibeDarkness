import '../../abilities/AbilityRegistry';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { defineAbility } from '../../abilities/defineAbility';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { nullHitbox } from '../../hitboxes';
import { resetGameObjectIdCounter } from '../GameObject';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { GameEngine } from '../GameEngine';
import type { Unit } from './Unit';
import { Movement } from '../../resources/Movement';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';

/**
 * Missing select labels (Step 2): a committed order that lacks a gated select's pick carries
 * `missingSelectLabels`. The marker is serialized on the cast, the lookahead never pauses for it, and
 * the select fizzles the cast on entry through the interrupt policy (refund by default).
 */

const DT = 1 / 60;
const ABILITY_ID = 'test_missing_select';
const LABEL = 'Spot';
const SELECT_START = 0.3;

const selectEntries = new WeakMap<object, number[]>();

function entriesFor(engine: object): number[] {
    let list = selectEntries.get(engine);
    if (!list) {
        list = [];
        selectEntries.set(engine, list);
    }
    return list;
}

function registerTestAbility(): void {
    registerAbilityForTest(defineAbility({
        id: ABILITY_ID,
        name: 'Missing Select Test',
        image: '',
        resourceCost: { resourceId: 'movement_points', amount: 1 },
        rechargeTurns: 0,
        prefireTime: SELECT_START,
        targets: [],
        getRange: () => ({ minRange: 0, maxRange: 200 }),
        getTooltipText: () => [],
        abilityTimings: [
            { id: 'windup', start: 0, end: SELECT_START, abilityPhase: AbilityPhase.Windup },
            {
                id: 'pick',
                start: SELECT_START,
                end: SELECT_START + DT,
                abilityPhase: AbilityPhase.Active,
                targetDef: { kind: 'select', label: LABEL, hitbox: nullHitbox, filter: 'any', allowMiss: true },
                castBehaviours: [{
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        entriesFor(ctx.engine).push((ctx.engine as unknown as GameEngine).gameTick);
                    }),
                }],
            },
            { id: 'after', start: SELECT_START + DT, end: SELECT_START + 0.2, abilityPhase: AbilityPhase.Active },
            { id: 'cooldown', start: SELECT_START + 0.2, end: SELECT_START + 0.5, abilityPhase: AbilityPhase.Cooldown },
        ],
    }));
}

function buildEngine(): { engine: GameEngine; player: Unit; movement: Movement } {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: 4 * CELL_SIZE + CELL_SIZE / 2,
        y: 5 * CELL_SIZE + CELL_SIZE / 2,
        abilities: [ABILITY_ID],
    });
    const movement = new Movement();
    player.attachResource(movement, engine.eventBus);
    for (let i = 0; i < 300 && engine.waitingForOrders == null; i++) engine.stepSimulationFixedTicks(1);
    expect(engine.waitingForOrders).not.toBeNull();
    return { engine, player, movement };
}

function commitMissingOrder(engine: GameEngine, player: Unit): void {
    engine.state.orderMgr.applyOrder({
        unitId: player.id,
        abilityId: ABILITY_ID,
        targets: [],
        targetsByLabel: {},
        missingSelectLabels: [LABEL],
        endTurn: true,
    });
}

function castActive(unit: Unit): boolean {
    return unit.activeAbilities.some((a) => a.abilityId === ABILITY_ID);
}

/**
 * A player-controlled caster pauses for the missing pick at the select gate (Step 3). These tests are about
 * the fizzle, so they answer that pause with `wait` (Pass). Returns true when a pause was answered.
 */
function passIfPaused(engine: GameEngine, player: Unit): boolean {
    const batch = engine.waitingForOrders;
    if (!batch?.waiters.some((w) => w.unitId === player.id)) return false;
    engine.state.orderMgr.applyOrder({ unitId: player.id, abilityId: 'wait', targets: [], endTurn: true });
    return true;
}

describe('missingSelectLabels', () => {
    beforeAll(() => {
        if (globalThis.requestAnimationFrame === undefined) {
            vi.stubGlobal(
                'requestAnimationFrame',
                (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
            );
            vi.stubGlobal('cancelAnimationFrame', (id: number) =>
                clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
            );
        }
        registerTestAbility();
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('fizzles the cast on the select entry tick, refunds the cost and never sets waitingForTargetInput', () => {
        const { engine, player, movement } = buildEngine();
        const before = movement.current;
        commitMissingOrder(engine, player);
        engine.stepSimulationFixedTicks(1);
        expect(castActive(player)).toBe(true);
        expect(movement.current).toBe(before - 1);

        let fizzleTick = -1;
        for (let i = 0; i < 240 && fizzleTick < 0; i++) {
            passIfPaused(engine, player);
            engine.stepSimulationFixedTicks(1);
            expect(engine.waitingForTargetInput).toBeNull();
            if (!castActive(player)) fizzleTick = engine.gameTick;
        }
        expect(fizzleTick).toBeGreaterThan(0);
        expect(entriesFor(engine)).toHaveLength(0);
        expect(movement.current).toBe(before);
        engine.destroy();
    });

    it('makes the caster a normal order waiter afterwards', () => {
        const { engine, player } = buildEngine();
        commitMissingOrder(engine, player);

        let waiting = false;
        for (let i = 0; i < 400 && !waiting; i++) {
            engine.stepSimulationFixedTicks(1);
            const isWaiter = engine.waitingForOrders?.waiters.some((w) => w.unitId === player.id) ?? false;
            if (isWaiter && castActive(player)) {
                // The missing-pick pause (cast still running): pass it, the cast then fizzles.
                passIfPaused(engine, player);
                continue;
            }
            waiting = isWaiter;
        }
        expect(waiting).toBe(true);
        expect(castActive(player)).toBe(false);
        expect(engine.waitingForTargetInput).toBeNull();
        engine.destroy();
    });

    it('survives a toJSON/fromJSON round trip mid-cast and fizzles on the same tick as the original', () => {
        const { engine, player } = buildEngine();
        commitMissingOrder(engine, player);
        for (let i = 0; i < 5; i++) engine.stepSimulationFixedTicks(1);
        expect(castActive(player)).toBe(true);

        const json = engine.toJSON();
        const jsonActive = (json.units as Array<{ id: string; activeAbilities: Array<Record<string, unknown>> }>)
            .find((u) => u.id === player.id)!
            .activeAbilities.find((a) => a.abilityId === ABILITY_ID)!;
        expect(jsonActive.missingSelectLabels).toEqual([LABEL]);

        const restored = GameEngine.fromJSON(
            JSON.parse(JSON.stringify(json)) as typeof json,
            TINY_BATTLE_PLAYER_ID,
            engine.terrainManager,
        );
        const restoredPlayer = restored.getUnit(player.id) as Unit;
        expect(restoredPlayer.activeAbilities.find((a) => a.abilityId === ABILITY_ID)?.missingSelectLabels)
            .toEqual([LABEL]);

        const fizzleTickOf = (e: GameEngine, p: Unit): number => {
            for (let i = 0; i < 240; i++) {
                passIfPaused(e, p);
                e.stepSimulationFixedTicks(1);
                expect(e.waitingForTargetInput).toBeNull();
                if (!castActive(p)) return e.gameTick;
            }
            return -1;
        };
        const originalTick = fizzleTickOf(engine, player);
        const restoredTick = fizzleTickOf(restored, restoredPlayer);
        expect(originalTick).toBeGreaterThan(0);
        expect(restoredTick).toBe(originalTick);
        expect(entriesFor(restored)).toHaveLength(0);

        engine.destroy();
        restored.destroy();
    });
});
