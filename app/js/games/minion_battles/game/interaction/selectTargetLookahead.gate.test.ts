import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
    AbilityPhase,
    computeTickElapsed,
    type AbilityTimingInterval,
} from '../../abilities/abilityTimings';
import type { TimingTargetDef } from '../../abilities/timingTargetDef';
import { findSelectGateSplit, selectGateDeferredIds } from './selectTargetLookahead';
import { defineAbility } from '../../abilities/defineAbility';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { nullHitbox } from '../../hitboxes';
import { resetGameObjectIdCounter } from '../GameObject';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import type { ResolvedTarget } from '../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';

/**
 * Select gate (Step 6): pure rules for the split, plus an engine-level check that effects scheduled
 * at a one-tick select's start land before the ITS pause, that the select still enters after the
 * pick, and that committed and preview runs match tick by tick.
 */

const DT = 1 / 60;

const selectDef: TimingTargetDef = {
    kind: 'select',
    label: 'Target',
    hitbox: {} as never,
    filter: 'enemy',
} as TimingTargetDef;

function interval(
    id: string,
    start: number,
    end: number,
    targetDef?: TimingTargetDef,
): AbilityTimingInterval {
    return { id, start, end, abilityPhase: AbilityPhase.Active, targetDef };
}

describe('computeTickElapsed resumeFrom', () => {
    it('without resumeFrom derives prev by subtracting dt', () => {
        const { prevElapsed, nextElapsed } = computeTickElapsed(1.0, DT, 0.5);
        expect(nextElapsed).toBe(0.5);
        expect(prevElapsed).toBe(0.5 - DT);
    });

    it('with resumeFrom uses it as prev and keeps the real next elapsed', () => {
        const { prevElapsed, nextElapsed } = computeTickElapsed(1.0, DT, 0.5, 0.2);
        expect(nextElapsed).toBe(0.5);
        expect(prevElapsed).toBe(0.2);
    });
});

describe('findSelectGateSplit', () => {
    it('returns null when no interactive select starts inside the window', () => {
        const intervals = [interval('a', 0, 0.3), interval('b', 0.3, 0.6, selectDef)];
        // Window (0.1, 0.2] does not contain the select start 0.3.
        expect(findSelectGateSplit(intervals, 0.1, 0.2)).toBeNull();
    });

    it('splits at the select start when the start falls inside (prev, next]', () => {
        const intervals = [interval('windup', 0, 0.3), interval('punch', 0.3, 0.6, selectDef)];
        const split = findSelectGateSplit(intervals, 0.29, 0.31);
        expect(split).toEqual({ intervalId: 'punch', elapsed: 0.3 });
    });

    it('splits when the select start equals next elapsed (tick ends exactly on the start)', () => {
        const intervals = [interval('punch', 0.3, 0.6, selectDef)];
        expect(findSelectGateSplit(intervals, 0.28, 0.3)).toEqual({ intervalId: 'punch', elapsed: 0.3 });
    });

    it('does not split when the select start equals prev elapsed (already past the gate)', () => {
        const intervals = [interval('punch', 0.3, 0.6, selectDef)];
        expect(findSelectGateSplit(intervals, 0.3, 0.32)).toBeNull();
    });

    it('does not gate a select at elapsed 0 (handled by the deferred-first-select path)', () => {
        const intervals = [interval('punch', 0, 0.3, selectDef)];
        expect(findSelectGateSplit(intervals, -DT, DT)).toBeNull();
    });

    it('ignores non-interactive targetDefs', () => {
        const hitDef = { kind: 'hit', labels: ['Target'] } as unknown as TimingTargetDef;
        const intervals = [interval('hit', 0.3, 0.6, hitDef)];
        expect(findSelectGateSplit(intervals, 0.29, 0.31)).toBeNull();
    });

    it('picks the earliest gated select when several start in the window', () => {
        const second = { ...selectDef, label: 'Second' } as TimingTargetDef;
        const intervals = [
            interval('late', 0.32, 0.5, second),
            interval('early', 0.3, 0.4, selectDef),
        ];
        expect(findSelectGateSplit(intervals, 0.29, 0.35)).toEqual({ intervalId: 'early', elapsed: 0.3 });
    });

    it('resumed window starting at the gated select does not split again', () => {
        const intervals = [interval('punch', 0.3, 0.6, selectDef)];
        // After the split the next tick resumes from prev = 0.3 (the select start).
        const resumed = computeTickElapsed(0.3 + DT * 2, DT, 0, 0.3);
        expect(findSelectGateSplit(intervals, resumed.prevElapsed, resumed.nextElapsed)).toBeNull();
    });
});

describe('selectGateDeferredIds', () => {
    it('returns the gated select and later intervals that start at the same time, not earlier ones', () => {
        const intervals = [
            interval('before', 0.3, 0.5),
            interval('select', 0.3, 0.3 + DT, selectDef),
            interval('same', 0.3, 0.4),
            interval('later', 0.31, 0.4),
        ];
        expect(selectGateDeferredIds(intervals, 'select')).toEqual(['select', 'same']);
    });
});

// ---------------------------------------------------------------------------
// Engine level: a one-tick gated select with an Instant({ at: 'end' }) ending at its start
// ---------------------------------------------------------------------------

const GATE_TEST_ABILITY_ID = 'test_select_gate_one_tick';
const GATE_TEST_LABEL = 'Spot';

/** Game ticks at which each side effect ran, per engine. */
const gateTestLog = new WeakMap<object, { windupEnd: number[]; selectEntry: number[] }>();

function logFor(engine: object): { windupEnd: number[]; selectEntry: number[] } {
    let log = gateTestLog.get(engine);
    if (!log) {
        log = { windupEnd: [], selectEntry: [] };
        gateTestLog.set(engine, log);
    }
    return log;
}

function registerGateTestAbility(selectStart: number): void {
    const selectEnd = selectStart + DT;
    registerAbilityForTest(defineAbility({
        id: GATE_TEST_ABILITY_ID,
        name: 'Gate Test',
        image: '',
        resourceCost: null,
        rechargeTurns: 0,
        prefireTime: selectStart,
        targets: [],
        getRange: () => ({ minRange: 0, maxRange: 200 }),
        getTooltipText: () => [],
        abilityTimings: [
            {
                id: 'windup',
                start: 0,
                end: selectStart,
                abilityPhase: AbilityPhase.Windup,
                castBehaviours: [{
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        logFor(ctx.engine).windupEnd.push((ctx.engine as unknown as GameEngine).gameTick);
                    }, { at: 'end' }),
                }],
            },
            {
                id: 'pick',
                start: selectStart,
                end: selectEnd,
                abilityPhase: AbilityPhase.Active,
                targetDef: { kind: 'select', label: GATE_TEST_LABEL, hitbox: nullHitbox, filter: 'any', allowMiss: true },
                castBehaviours: [{
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        logFor(ctx.engine).selectEntry.push((ctx.engine as unknown as GameEngine).gameTick);
                    }),
                }],
            },
            { id: 'after', start: selectEnd, end: selectEnd + 0.2, abilityPhase: AbilityPhase.Active },
            { id: 'cooldown', start: selectEnd + 0.2, end: selectEnd + 0.5, abilityPhase: AbilityPhase.Cooldown },
        ],
    }));
}

const GATE_TEST_PICK: ResolvedTarget = {
    type: 'pixel',
    position: { x: 6 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
};

function buildGateTestEngine(): { engine: GameEngine; player: Unit } {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: 4 * CELL_SIZE + CELL_SIZE / 2,
        y: 5 * CELL_SIZE + CELL_SIZE / 2,
        abilities: [GATE_TEST_ABILITY_ID],
    });
    for (let i = 0; i < 300 && engine.waitingForOrders == null; i++) engine.stepSimulationFixedTicks(1);
    expect(engine.waitingForOrders).not.toBeNull();
    return { engine, player };
}

function castActive(player: Unit): boolean {
    return player.activeAbilities.some((a) => a.abilityId === GATE_TEST_ABILITY_ID);
}

/** Steps one tick at a time, recording the runtime fingerprint at each game tick reached. */
function stepRecording(
    engine: GameEngine,
    fingerprints: Map<number, string>,
    until: () => boolean,
    maxTicks = 300,
): void {
    for (let i = 0; i < maxTicks && !until(); i++) {
        engine.stepSimulationFixedTicks(1);
        fingerprints.set(engine.gameTick, engine.getRuntimeFingerprintHex());
    }
    expect(until()).toBe(true);
}

describe.each([
    ['mid-tick', 0.31],
    ['on a tick boundary', 0.3],
])('one-tick gated select starting %s', (_name, selectStart) => {
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
        registerGateTestAbility(selectStart);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    function runPreview(): { engine: GameEngine; fingerprints: Map<number, string>; pauseTick: number } {
        const { engine, player } = buildGateTestEngine();
        const fingerprints = new Map<number, string>();
        engine.isSequentialTargetingPreview = true;
        engine.sequentialTargetingPreviewCast = {
            unitId: player.id,
            abilityId: GATE_TEST_ABILITY_ID,
            startRound: engine.roundNumber,
        };
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: GATE_TEST_ABILITY_ID,
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        });

        stepRecording(engine, fingerprints, () => engine.waitingForTargetInput?.label === GATE_TEST_LABEL);
        const pauseTick = engine.gameTick;
        const log = logFor(engine);
        // Paused for the pick: the windup's end-of-window effect has already run, the select has not entered.
        expect(log.windupEnd).toHaveLength(1);
        expect(log.selectEntry).toHaveLength(0);

        const active = player.activeAbilities.find((a) => a.abilityId === GATE_TEST_ABILITY_ID)!;
        active.targetsByLabel![GATE_TEST_LABEL] = GATE_TEST_PICK;
        active.targets = [GATE_TEST_PICK];
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        stepRecording(engine, fingerprints, () => !castActive(player));
        return { engine, fingerprints, pauseTick };
    }

    it('applies the windup end before the pause, then enters the select on the next tick', () => {
        const { engine, pauseTick } = runPreview();
        const log = logFor(engine);
        expect(log.windupEnd).toEqual([pauseTick]);
        expect(log.selectEntry).toEqual([pauseTick + 1]);
        engine.destroy();
    });

    it('matches a committed run tick by tick', () => {
        const preview = runPreview();

        const { engine: committed, player } = buildGateTestEngine();
        const committedFingerprints = new Map<number, string>();
        committed.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: GATE_TEST_ABILITY_ID,
            targets: [GATE_TEST_PICK],
            endTurn: true,
        });
        stepRecording(committed, committedFingerprints, () => castActive(player) || logFor(committed).windupEnd.length > 0);
        stepRecording(committed, committedFingerprints, () => !castActive(player));

        // Same ticks for both side effects in both runs.
        expect(logFor(committed).windupEnd).toEqual(logFor(preview.engine).windupEnd);
        expect(logFor(committed).selectEntry).toEqual(logFor(preview.engine).selectEntry);

        let compared = 0;
        for (const [tick, fingerprint] of committedFingerprints) {
            const other = preview.fingerprints.get(tick);
            if (other === undefined) continue;
            expect({ tick, fingerprint: other }).toEqual({ tick, fingerprint });
            compared++;
        }
        expect(compared).toBeGreaterThan(Math.round((selectStart + 0.2) / DT));

        committed.destroy();
        preview.engine.destroy();
    });
});
