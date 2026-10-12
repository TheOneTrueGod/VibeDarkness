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
import type { BattleOrder, ResolvedTarget } from '../types';
import type { Unit } from './Unit';
import { Movement } from '../../resources/Movement';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';

/**
 * Missing-pick pause plane (Step 3). A committed order that lacks a gated select's pick carries
 * `missingSelectLabels`. In the real timeline the cast pauses the owner at the select gate
 * (`awaitingPickLabel`), who answers with an `updateTargets` order (the pick) or `wait` (Pass: fizzle).
 * Inside a preview the pause is dropped (automatic pass-and-fizzle). All decisions read only serialized
 * cast data, so a rebuilt engine behaves like the original.
 */

const DT = 1 / 60;
const CAST_ID = 'test_missing_pick';
const NATURAL_ID = 'test_missing_pick_natural';
const LABEL = 'Spot';
const SELECT_START = 0.3;
const TEAMMATE_ID = 'tiny_p2';

/** Targets seen by the select interval's entry behaviour, per engine. */
const pickLog = new WeakMap<object, ResolvedTarget[]>();

function picksFor(engine: object): ResolvedTarget[] {
    let list = pickLog.get(engine);
    if (!list) {
        list = [];
        pickLog.set(engine, list);
    }
    return list;
}

function registerTestAbilities(): void {
    registerAbilityForTest(defineAbility({
        id: CAST_ID,
        name: 'Missing Pick Test',
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
                        picksFor(ctx.engine).push(ctx.target);
                    }),
                }],
            },
            { id: 'after', start: SELECT_START + DT, end: SELECT_START + 0.2, abilityPhase: AbilityPhase.Active },
            { id: 'cooldown', start: SELECT_START + 0.2, end: SELECT_START + 0.5, abilityPhase: AbilityPhase.Cooldown },
        ],
    }));
    // Ends by duration on the same tick the select gate of CAST_ID is reached (both are 0.3 s long up to there).
    registerAbilityForTest(defineAbility({
        id: NATURAL_ID,
        name: 'Missing Pick Natural End',
        image: '',
        resourceCost: null,
        rechargeTurns: 0,
        prefireTime: SELECT_START,
        targets: [],
        getRange: () => ({ minRange: 0, maxRange: 200 }),
        getTooltipText: () => [],
        abilityTimings: [
            { id: 'windup', start: 0, end: SELECT_START, abilityPhase: AbilityPhase.Windup },
        ],
    }));
}

function makePick(): ResolvedTarget {
    return {
        type: 'pixel',
        position: { x: 6 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
    };
}

interface Fixture {
    engine: GameEngine;
    player: Unit;
    movement: Movement;
    teammate?: Unit;
    teammateMovement?: Movement;
}

function buildEngine(opts?: { teammate?: boolean; teammateIsAi?: boolean }): Fixture {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: 4 * CELL_SIZE + CELL_SIZE / 2,
        y: 5 * CELL_SIZE + CELL_SIZE / 2,
        abilities: [CAST_ID, NATURAL_ID],
    });
    const movement = new Movement();
    player.attachResource(movement, engine.eventBus);
    const fixture: Fixture = { engine, player, movement };
    if (opts?.teammate) {
        const teammate = spawnTinyPlayerUnit(engine, {
            playerId: TEAMMATE_ID,
            x: 8 * CELL_SIZE + CELL_SIZE / 2,
            y: 5 * CELL_SIZE + CELL_SIZE / 2,
            abilities: [CAST_ID, NATURAL_ID],
        });
        if (opts.teammateIsAi) teammate.ownerId = 'ai';
        const teammateMovement = new Movement();
        teammate.attachResource(teammateMovement, engine.eventBus);
        fixture.teammate = teammate;
        fixture.teammateMovement = teammateMovement;
    }
    for (let i = 0; i < 300 && engine.waitingForOrders == null; i++) engine.stepSimulationFixedTicks(1);
    expect(engine.waitingForOrders).not.toBeNull();
    return fixture;
}

function missingOrder(unit: Unit): BattleOrder {
    return {
        unitId: unit.id,
        abilityId: CAST_ID,
        targets: [],
        targetsByLabel: {},
        missingSelectLabels: [LABEL],
        endTurn: true,
    };
}

function passOrder(unit: Unit): BattleOrder {
    return { unitId: unit.id, abilityId: 'wait', targets: [], endTurn: true };
}

function updateOrder(unit: Unit, pick: ResolvedTarget = makePick()): BattleOrder {
    return {
        unitId: unit.id,
        abilityId: CAST_ID,
        targets: [pick],
        targetsByLabel: { [LABEL]: pick },
        updateTargets: true,
        endTurn: true,
    };
}

function activeCast(unit: Unit): Unit['activeAbilities'][number] | undefined {
    return unit.activeAbilities.find((a) => a.abilityId === CAST_ID);
}

/** Steps until an order pause forms. Expects it to be the missing-pick pause for `caster`. */
function stepUntilMissingPickPause(engine: GameEngine, caster: Unit, maxTicks = 200): void {
    for (let i = 0; i < maxTicks && engine.waitingForOrders == null; i++) engine.stepSimulationFixedTicks(1);
    expect(engine.waitingForOrders).not.toBeNull();
    expect(engine.waitingForOrders!.waiters.some((w) => w.unitId === caster.id)).toBe(true);
    expect(activeCast(caster)?.awaitingPickLabel).toBe(LABEL);
}

describe('missing-pick pause', () => {
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
        registerTestAbilities();
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('forms an order pause for the caster at the select gate and never sets waitingForTargetInput', () => {
        const { engine, player, movement } = buildEngine();
        const before = movement.current;
        engine.state.orderMgr.applyOrder(missingOrder(player));
        stepUntilMissingPickPause(engine, player);

        expect(engine.waitingForTargetInput).toBeNull();
        expect(engine.waitingForOrders!.waiters.map((w) => w.unitId)).toEqual([player.id]);
        // The pause is taken before the select enters: an order at the pause applies at the next tick.
        expect(engine.waitingForOrders!.atTick).toBe(engine.gameTick + 1);
        expect(activeCast(player)?.missingSelectLabels).toEqual([LABEL]);
        expect(movement.current).toBe(before - 1);
        expect(picksFor(engine)).toHaveLength(0);
        engine.destroy();
    });

    it('applies an updateTargets order: the select enters with the pick and no extra cost is spent', () => {
        const { engine, player, movement } = buildEngine();
        const before = movement.current;
        engine.state.orderMgr.applyOrder(missingOrder(player));
        stepUntilMissingPickPause(engine, player);

        engine.state.orderMgr.applyOrder(updateOrder(player));
        expect(engine.waitingForOrders).toBeNull();
        engine.stepSimulationFixedTicks(1);

        expect(picksFor(engine)).toHaveLength(1);
        expect(picksFor(engine)[0]!.position).toEqual(makePick().position);
        const cast = activeCast(player);
        expect(cast).toBeDefined();
        expect(cast!.awaitingPickLabel).toBeUndefined();
        expect(cast!.missingSelectLabels).toBeUndefined();
        expect(cast!.targets[0]?.position).toEqual(makePick().position);
        // Cost was spent once, by the original cast order; the update order spends nothing.
        expect(movement.current).toBe(before - 1);
        expect(player.activeAbilities.filter((a) => a.abilityId === CAST_ID)).toHaveLength(1);
        engine.destroy();
    });

    it('fizzles the cast with the policy refund on wait (Pass), and a normal pause follows later', () => {
        const { engine, player, movement } = buildEngine();
        const before = movement.current;
        engine.state.orderMgr.applyOrder(missingOrder(player));
        stepUntilMissingPickPause(engine, player);
        expect(movement.current).toBe(before - 1);

        engine.state.orderMgr.applyOrder(passOrder(player));
        expect(engine.waitingForOrders).toBeNull();
        engine.stepSimulationFixedTicks(1);
        // The select enters next tick with its label still missing and fizzles the cast.
        expect(activeCast(player)).toBeUndefined();
        expect(movement.current).toBe(before);
        expect(picksFor(engine)).toHaveLength(0);

        let normalPause = false;
        for (let i = 0; i < 400 && !normalPause; i++) {
            engine.stepSimulationFixedTicks(1);
            normalPause = engine.waitingForOrders?.waiters.some((w) => w.unitId === player.id) ?? false;
        }
        expect(normalPause).toBe(true);
        expect(activeCast(player)).toBeUndefined();
        engine.destroy();
    });

    it('does not pause for a caster nobody controls: the select fizzles the cast on entry', () => {
        // An AI-owned ally casts; the player stays player-controlled so the battle is not over.
        const { engine, player, teammate, teammateMovement } = buildEngine({ teammate: true, teammateIsAi: true });
        const ally = teammate!;
        const before = teammateMovement!.current;
        // AI orders are queued directly (they are never batch waiters); the player passes to resume.
        engine.state.orderMgr.queueOrder(engine.waitingForOrders!.atTick, missingOrder(ally));
        engine.state.orderMgr.applyOrder(passOrder(player));

        let started = false;
        let fizzled = false;
        for (let i = 0; i < 120 && !fizzled; i++) {
            engine.stepSimulationFixedTicks(1);
            if (activeCast(ally) !== undefined) {
                started = true;
                expect(engine.waitingForOrders?.waiters.some((w) => w.unitId === ally.id) ?? false).toBe(false);
                expect(activeCast(ally)!.awaitingPickLabel).toBeUndefined();
            } else if (started) {
                fizzled = true;
            }
        }
        expect(started).toBe(true);
        expect(fizzled).toBe(true);
        expect(teammateMovement!.current).toBe(before);
        expect(picksFor(engine)).toHaveLength(0);
        engine.destroy();
    });

    it('rejects any other ability order and a plain recast at the pause', () => {
        const { engine, player } = buildEngine();
        engine.state.orderMgr.applyOrder(missingOrder(player));
        stepUntilMissingPickPause(engine, player);
        const atTick = engine.waitingForOrders!.atTick;

        engine.state.orderMgr.applyOrder({ unitId: player.id, abilityId: NATURAL_ID, targets: [], endTurn: true });
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.state.orderMgr.hasAnyPendingOrderForUnit(player.id, atTick)).toBe(false);

        // Same ability without updateTargets is a recast, not a pick.
        engine.state.orderMgr.applyOrder({ ...missingOrder(player), missingSelectLabels: undefined });
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.state.orderMgr.hasAnyPendingOrderForUnit(player.id, atTick)).toBe(false);

        expect(activeCast(player)?.awaitingPickLabel).toBe(LABEL);
        engine.destroy();
    });

    it('survives a toJSON/fromJSON rebuild: same pause, same pick handling, same fingerprints', () => {
        const a = buildEngine();
        a.engine.state.orderMgr.applyOrder(missingOrder(a.player));
        for (let i = 0; i < 10; i++) a.engine.stepSimulationFixedTicks(1);
        expect(activeCast(a.player)).toBeDefined();
        expect(a.engine.waitingForOrders).toBeNull();

        const rebuild = (source: GameEngine): { engine: GameEngine; player: Unit } => {
            const json = source.toJSON();
            // Carry the runtime fingerprint the way BattleSession / the ITS mark restore do.
            const engine = GameEngine.fromJSON(
                JSON.parse(JSON.stringify(json)) as typeof json,
                TINY_BATTLE_PLAYER_ID,
                source.terrainManager,
                { checkpointRuntimeFingerprintHex: source.getRuntimeFingerprintHex() },
            );
            return { engine, player: engine.getUnit(a.player.id) as Unit };
        };

        // Rebuild before the pause: targetsByLabel is gone, only the serialized marker remains.
        const b = rebuild(a.engine);
        stepUntilMissingPickPause(a.engine, a.player);
        stepUntilMissingPickPause(b.engine, b.player);
        expect(b.engine.gameTick).toBe(a.engine.gameTick);
        expect(b.engine.waitingForOrders!.atTick).toBe(a.engine.waitingForOrders!.atTick);
        expect(b.engine.waitingForOrders!.waiters).toEqual(a.engine.waitingForOrders!.waiters);
        expect(activeCast(b.player)?.awaitingPickLabel).toBe(activeCast(a.player)?.awaitingPickLabel);
        expect(b.engine.getRuntimeFingerprintHex()).toBe(a.engine.getRuntimeFingerprintHex());

        // The same update order on both.
        a.engine.state.orderMgr.applyOrder(updateOrder(a.player));
        b.engine.state.orderMgr.applyOrder(updateOrder(b.player));
        a.engine.stepSimulationFixedTicks(1);
        b.engine.stepSimulationFixedTicks(1);
        expect(picksFor(a.engine)).toHaveLength(1);
        expect(picksFor(b.engine)).toHaveLength(1);
        expect(picksFor(b.engine)[0]!.position).toEqual(picksFor(a.engine)[0]!.position);
        expect(b.engine.getRuntimeFingerprintHex()).toBe(a.engine.getRuntimeFingerprintHex());

        // Rebuild again after the select entered: the pick survives in the saved positional targets.
        const c = rebuild(a.engine);
        expect(activeCast(c.player)?.targets[0]?.position).toEqual(makePick().position);
        expect(activeCast(c.player)?.awaitingPickLabel).toBeUndefined();
        expect(activeCast(c.player)?.missingSelectLabels).toBeUndefined();

        const engines = [a.engine, b.engine, c.engine];
        for (let i = 0; i < 400 && engines.some((e) => e.waitingForOrders == null); i++) {
            for (const e of engines) e.stepSimulationFixedTicks(1);
        }
        for (const e of engines) expect(e.waitingForOrders).not.toBeNull();
        expect(b.engine.gameTick).toBe(a.engine.gameTick);
        expect(c.engine.gameTick).toBe(a.engine.gameTick);
        expect(b.engine.getRuntimeFingerprintHex()).toBe(a.engine.getRuntimeFingerprintHex());
        expect(c.engine.getRuntimeFingerprintHex()).toBe(a.engine.getRuntimeFingerprintHex());

        for (const e of engines) e.destroy();
    });

    it('drops a teammate missing-pick waiter during a preview: the cast fizzles next tick and the hook is flagged', () => {
        const { engine, player, teammate, teammateMovement } = buildEngine({ teammate: true });
        const caster = teammate!;
        const before = teammateMovement!.current;
        const calls: Array<{
            decision: 'drop' | 'freeze';
            unitIds: string[];
            gameTick: number;
            info?: { missingPick: true };
        }> = [];
        engine.setOnItsParallelPauseDecision((decision, waiters, gameTick, info) => {
            calls.push({ decision, unitIds: waiters.map((w) => w.unitId), gameTick, info });
        });
        engine.isSequentialTargetingPreview = true;
        engine.state.orderMgr.applyOrder(passOrder(player));
        engine.state.orderMgr.applyOrder(missingOrder(caster));

        let fizzleTick = -1;
        for (let i = 0; i < 240 && fizzleTick < 0; i++) {
            engine.stepSimulationFixedTicks(1);
            // Previews never freeze on the missing-pick pause.
            expect(engine.waitingForOrders).toBeNull();
            if (activeCast(caster) === undefined) fizzleTick = engine.gameTick;
        }
        expect(fizzleTick).toBeGreaterThan(0);

        const missingCalls = calls.filter((c) => c.info?.missingPick === true);
        expect(missingCalls).toHaveLength(1);
        expect(missingCalls[0]!.decision).toBe('drop');
        expect(missingCalls[0]!.unitIds).toEqual([caster.id]);
        expect(fizzleTick).toBe(missingCalls[0]!.gameTick + 1);
        expect(teammateMovement!.current).toBe(before);
        expect(picksFor(engine)).toHaveLength(0);
        engine.destroy();
    });

    it('puts a same-tick natural-completion waiter and a missing-pick waiter in one batch', () => {
        const { engine, player, teammate } = buildEngine({ teammate: true });
        engine.state.orderMgr.applyOrder(missingOrder(player));
        engine.state.orderMgr.applyOrder({ unitId: teammate!.id, abilityId: NATURAL_ID, targets: [], endTurn: true });

        stepUntilMissingPickPause(engine, player);
        const batch = engine.waitingForOrders!;
        expect(new Set(batch.waiters.map((w) => w.unitId))).toEqual(new Set([player.id, teammate!.id]));
        // A mid-cast pause is not a natural completion: no teamwork cancel.
        expect(batch.teamworkCancelledOwnerIds).toBeUndefined();
        engine.destroy();
    });
});
