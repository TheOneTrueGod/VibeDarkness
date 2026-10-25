/**
 * A unit phase entered during an interactive-targeting preview (ITS playahead) must behave exactly as in a
 * committed run, transition included. Same two-engine harness as `previewCanonEquivalence.test.ts` (kept in a
 * separate file so that one stays untouched): engine A applies the finalized wire order canonically from a mark;
 * engine B runs the full ITS flow (preview, then rollback commit). Both are stepped through the phase's Time Stop
 * and invulnerability window to the next order pause and compared.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { GameEngine } from '../GameEngine';
import { BattleSession } from '../BattleSession';
import type { BattleOrder } from '../types';
import { resetGameObjectIdCounter } from '../GameObject';
import { fingerprintToHex } from '../Fingerprint';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getSelectTargetDefsFromTimings } from '../../abilities/targeting';
import { initializeAbilityRuntimeForUnit } from '../../abilities/abilityUses';
import { createTargetDummyAtWorld } from '../../testing/fixtures/targetDummies';
import { hashOrderId } from '../battlenet/helpers/orderHashing';
import { buildFinalizedSequentialTargetingOrder } from './InteractiveTargetingSession';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import { getUnitDefEntry } from '../units/unit_defs/unitDef';
import { UnitTag, hasUnitTag } from '../units/unitTag';
import { peekPhaseState } from '../units/components/phaseComponent';

const PUNCH = '0120';
const SOLO = 'p1';
const DUMMY_DEF = getUnitDefEntry('dog')!;

beforeAll(() => {
    if (globalThis.requestAnimationFrame === undefined) {
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
        vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
    }
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
    DUMMY_DEF.phases = undefined;
});

function makeApiStub(): MinionBattlesApi {
    return { setCurrentPlayerId: vi.fn(), sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }) } as unknown as MinionBattlesApi;
}

function stepUntil(engine: GameEngine, predicate: () => boolean, maxTicks = 300): boolean {
    for (let i = 0; i < maxTicks; i++) {
        if (predicate()) return true;
        engine.stepSimulationFixedTicks(1);
    }
    return predicate();
}

describe('preview/canon equivalence: a phase entered by a previewed hit', () => {
    it('punch crosses an HP threshold: Time Stop, invulnerability, tags and onEnter match the canonical run', async () => {
        DUMMY_DEF.phases = [
            {
                id: 'rage',
                enterWhen: { kind: 'health_below_percent', threshold: 0.99 },
                tags: { add: [UnitTag.Enraged] },
                transition: { kind: 'timeStop', durationSeconds: 0.5, invulnerableSeconds: 0.5, banner: 'Rage' },
                onEnter: [{ type: 'spawnLightSource', lightAmount: -1, radius: 2, durationRounds: 1, position: 'victim' }],
            },
        ];

        resetGameObjectIdCounter(1);
        const session = new BattleSession({ api: makeApiStub(), missionId: 'dark_awakening', playerId: SOLO, isHost: false });
        await session.load({
            players: { [SOLO]: { id: SOLO, name: 'P1', color: '#fff' } },
            characterSelections: { [SOLO]: 'warrior' },
            battleSeed: 1,
        });
        const engine = session.getEngine()!;
        engine.stop();
        const caster = engine.getLocalPlayerUnit()!;
        caster.abilities = [PUNCH];
        initializeAbilityRuntimeForUnit(caster);
        const dummy = createTargetDummyAtWorld(engine, caster.x + 20, caster.y, { id: 'phase_dummy', hp: 500 });
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        expect(stepUntil(engine, () => engine.waitingForOrders != null, 400)).toBe(true);
        const ability = getAbility(PUNCH)!;
        const labels = getSelectTargetDefsFromTimings(ability, caster, engine).map((d) => d.label);
        const targets = Object.fromEntries(labels.map((l) => [l, { type: 'unit' as const, unitId: dummy.id }]));
        const baseOrder: BattleOrder = { unitId: caster.id, abilityId: PUNCH, targets: [], endTurn: true };
        const wireOrder = buildFinalizedSequentialTargetingOrder(labels, targets, baseOrder);

        const markTick = engine.gameTick;
        const mark = engine.toJSON();
        mark.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();

        // Engine A: canonical.
        const sessionA = new BattleSession({ api: makeApiStub(), missionId: 'dark_awakening', playerId: SOLO, isHost: false });
        sessionA.restoreFromInMemorySnapshot(mark);
        const engineA = sessionA.getEngine()!;
        engineA.stop();
        engineA.state.orderMgr.applyOrder(wireOrder);
        expect(stepUntil(engineA, () => engineA.waitingForOrders != null, 900)).toBe(true);

        // Engine B: ITS preview (the phase fires inside the playahead), then rollback commit.
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            submitOrder: vi.fn(async (order: BattleOrder, atTick: number) => {
                const idHash = hashOrderId(session.getLocalPlayerId(), atTick, order);
                session.applyRemoteOrders([{ atTick, order, idHash, playerId: session.getLocalPlayerId() }]);
            }),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);
        const its = session.interactiveTargeting;
        expect(its.begin(baseOrder, session)).toBe(true);
        for (const label of labels) {
            if (engine.waitingForTargetInput?.label !== label) {
                expect(stepUntil(engine, () => engine.waitingForTargetInput?.label === label, 300)).toBe(true);
            }
            its.resolveTarget(label, targets[label]!, session);
        }
        // Play the preview far enough that the previewed hit has entered the phase (and its Time Stop).
        expect(stepUntil(engine, () => peekPhaseState(dummy)!.index === 1, 300)).toBe(true);
        expect(engine.gameTick).toBeGreaterThan(markTick);
        expect(hasUnitTag(dummy, UnitTag.Enraged)).toBe(true);

        await its.commit(session);
        const engineB = session.getEngine()!;
        engineB.stop();
        expect(stepUntil(engineB, () => engineB.waitingForOrders != null, 900)).toBe(true);

        // Same outcome: ticks, pause batch, fingerprint, and the phase's own state.
        const common = Math.min(engineA.gameTick, engineB.gameTick);
        const fp = (e: GameEngine) => {
            const entry = e.state.runtimeFingerprintRing.getEntryAt(common);
            return entry ? fingerprintToHex(entry.fp) : null;
        };
        expect(engineB.gameTick).toBe(engineA.gameTick);
        expect(engineB.waitingForOrders?.atTick).toBe(engineA.waitingForOrders?.atTick);
        expect(fp(engineB)).toBe(fp(engineA));
        const a = engineA.getUnit(dummy.id)!;
        const b = engineB.getUnit(dummy.id)!;
        expect(peekPhaseState(a)!.index).toBe(1);
        expect(peekPhaseState(b)).toEqual(peekPhaseState(a));
        expect(b.tags).toEqual(a.tags);
        expect(b.hp).toBe(a.hp);
        expect(engineB.state.timeManager.toJSON()).toEqual(engineA.state.timeManager.toJSON());
        expect(engineB.lightSources.length).toBe(engineA.lightSources.length);

        engineA.destroy();
        engineB.destroy();
    });
});
