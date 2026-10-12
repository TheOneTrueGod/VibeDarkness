/**
 * Preview/canon execution equivalence harness (Step 5 of
 * docs/plans/kept-playahead-desync-fixes.md).
 *
 * Lobby 5E0F6B showed that a non-host's *kept* ITS preview timeline can execute an ability
 * differently than a fresh client applying the same finalized wire order canonically — the
 * host paused at a batch the client's kept preview never reached. Step 2 of this plan reverted
 * non-host in-place-with-playahead back to rollback-only specifically because this equivalence
 * was unverified. This file pins a deterministic, per-ability repro of that equivalence:
 *
 *   - "engine A" (canonical): a fresh `GameEngine` restored from the same paused-at-batch mark,
 *     with the finalized order applied directly via `orderMgr.applyOrder` — the path a remote
 *     client runs when it receives the wire order.
 *   - "engine B" (preview): the SAME live session driven through the full ITS flow
 *     (`begin` -> `resolveTarget` -> `commit`). Because the session is non-host and the preview
 *     always advances past the mark tick before all targets are collected, Step 2's rollback-only
 *     rule applies here too — `commit()` restores to the mark and resubmits, so "engine B" is the
 *     ITS-restored-and-resubmitted engine, not the raw kept preview.
 *
 * Both engines are stepped to their next parallel-order pause and compared: `gameTick`,
 * `waitingForOrders.atTick`, waiter unit ids, and the runtime fingerprint at the common tick.
 * A case that reveals a genuine divergence is marked `test.fails` per the plan (fix tracked via a
 * `docs/TODO.md` entry) rather than patched here — the deliverable is the pinned repro.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { GameEngine } from '../GameEngine';
import { BattleSession } from '../BattleSession';
import type { BattleOrder, ResolvedTarget } from '../types';
import type { Unit } from '../units/Unit';
import { resetGameObjectIdCounter } from '../GameObject';
import { fingerprintToHex } from '../Fingerprint';
import { getAbility, getAllAbilities } from '../../abilities/AbilityRegistry';
import { getSelectTargetDefsFromTimings, buildAiSelectTargets } from '../../abilities/targeting';
import { getAbilityResourceCosts } from '../../abilities/Ability';
import { initializeAbilityRuntimeForUnit } from '../../abilities/abilityUses';
import { createTargetDummyAtWorld } from '../../testing/fixtures/targetDummies';
import { Movement } from '../../resources/Movement';
import { createResourceFromId } from '../../resources/createResourceFromId';
import { hashOrderId } from '../battlenet/helpers/orderHashing';
import { buildFinalizedSequentialTargetingOrder } from './InteractiveTargetingSession';
import { tileCentre, worldToTile } from '../../abilities/tileAreaHelpers';
import { TerrainType } from '../../terrain/TerrainType';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import { Light } from '../../resources/Light';
import { LIGHT_BLAST_LIGHT_COST } from '../../card_defs/08_light_core/0801_LightBlast/0801Ability';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import { isITSPreviewComplete } from './isITSPreviewComplete';

/** PunchNEW — single melee strike, implicated in the 5E0F6B incident (plan Context). */
const PUNCH_ABILITY_ID = '0120';
const PUNCH_TARGET_LABEL = 'Target';
/** Double Punch — two sequential melee strikes; earlier preview/canon offender (commit b33da3e). */
const DOUBLE_PUNCH_ABILITY_ID = '0116';
const DOUBLE_PUNCH_TARGET_1_LABEL = 'Target 1';
const DOUBLE_PUNCH_TARGET_2_LABEL = 'Target 2';
/** Digging Claws — wall-penetrating dash; earlier preview/canon offender (commit 36cfe8a). */
const DIGGING_CLAWS_ABILITY_ID = '0534';
const DIGGING_CLAWS_DASH_LABEL = 'Direction to dash';
/** Rock Slide — two gated selects (Rock at t=0, Direction mid-cast) and a held projectile. */
const ROCK_SLIDE_ABILITY_ID = '0537';
const ROCK_SLIDE_ROCK_LABEL = 'Rock';
const ROCK_SLIDE_DIRECTION_LABEL = 'Direction';

const SOLO_PLAYER_ID = 'p1';

/** Attach resources an ability's costs demand on a bare test caster (mirrors mission bootstrap). */
function ensureAbilityResourcesForCaster(caster: Unit, ability: { id: string }, engine: GameEngine): void {
    const abilityStatic = getAbility(ability.id);
    if (!abilityStatic) return;
    for (const cost of getAbilityResourceCosts(abilityStatic)) {
        let resource = caster.getResource(cost.resourceId);
        if (!resource) {
            resource = createResourceFromId(cost.resourceId) ?? undefined;
            if (!resource) continue;
            caster.attachResource(resource, engine.eventBus);
        }
        resource.add(resource.max);
    }
}

/** Abilities that reach the ITS flow (at least one `SelectTargetDef`) — the surface this bug family affects. */
const ABILITIES_WITH_SELECT_TARGETS = getAllAbilities().filter(
    (ability) => getSelectTargetDefsFromTimings(ability).length > 0,
);

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
});

afterAll(() => {
    vi.unstubAllGlobals();
});

function makeApiStub(): MinionBattlesApi {
    return {
        setCurrentPlayerId: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }),
    } as unknown as MinionBattlesApi;
}

/** Step engine forward one tick at a time until predicate returns true or limit reached. */
function stepUntil(engine: GameEngine, predicate: () => boolean, maxTicks = 300): boolean {
    for (let i = 0; i < maxTicks; i++) {
        if (predicate()) return true;
        engine.stepSimulationFixedTicks(1);
    }
    return predicate();
}

async function mountSoloSession(isHost = false): Promise<BattleSession> {
    resetGameObjectIdCounter(1);
    const session = new BattleSession({
        api: makeApiStub(),
        missionId: 'dark_awakening',
        playerId: SOLO_PLAYER_ID,
        isHost,
    });
    await session.load({
        players: { [SOLO_PLAYER_ID]: { id: SOLO_PLAYER_ID, name: 'P1', color: '#fff' } },
        characterSelections: { [SOLO_PLAYER_ID]: 'warrior' },
        battleSeed: 1,
    });
    session.getEngine()!.stop();
    return session;
}

interface EquivalenceCaseSetup {
    abilityId: string;
    /** Attach resources/spawn enemies for the caster; return the ResolvedTarget for each SelectTargetDef label. */
    setup: (caster: Unit, engine: GameEngine) => Record<string, ResolvedTarget>;
}

interface EquivalenceResult {
    engineA: GameEngine;
    engineB: GameEngine;
}

/**
 * Build the shared paused-at-batch mark, then run engine A (canonical wire order) and engine B
 * (full ITS begin -> resolveTarget -> commit flow, rollback mode) from it. Returns both engines
 * stepped to their next parallel-order pause, for the caller to compare.
 */
async function runPreviewCanonEquivalence(setup: EquivalenceCaseSetup): Promise<EquivalenceResult> {
    const session = await mountSoloSession();
    const engine = session.getEngine()!;
    const caster = engine.getLocalPlayerUnit()!;

    caster.abilities = [setup.abilityId];
    initializeAbilityRuntimeForUnit(caster);
    // Some abilities (e.g. Energy Blast, Cone of Light) start with 0 uses and only become castable
    // once a charge-recovery mechanic accrues over many rounds — irrelevant to what this harness
    // checks, so force full uses rather than waiting on (or faking) that accrual.
    const runtime = caster.abilityRuntime[setup.abilityId];
    if (runtime) runtime.currentUses = runtime.maxUses;
    const labelTargets = setup.setup(caster, engine);

    const gotBatch = stepUntil(engine, () => engine.waitingForOrders != null, 400);
    expect(gotBatch).toBe(true);

    const ability = getAbility(setup.abilityId);
    expect(ability).toBeDefined();
    const selectDefs = getSelectTargetDefsFromTimings(ability!, caster, engine);
    const selectLabels = selectDefs.map((d) => d.label);
    expect(selectLabels.length).toBeGreaterThan(0);

    const baseOrder: BattleOrder = { unitId: caster.id, abilityId: setup.abilityId, targets: [], endTurn: true };
    const wireOrder = buildFinalizedSequentialTargetingOrder(selectLabels, labelTargets, baseOrder);

    const markTick = engine.gameTick;
    const mark = engine.toJSON();
    mark.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();

    // --- Engine A: canonical wire-order path (a fresh client applying the finalized order directly). ---
    // Restored via BattleSession (not a bare GameEngine.fromJSON) so world modifiers / level events /
    // battle objectives are re-installed exactly like engine B's later restore-on-commit — otherwise a
    // bare clone would silently run with no world modifiers installed and could show a spurious
    // "divergence" that is really a test-harness asymmetry, not a preview/canon engine bug.
    const sessionA = new BattleSession({
        api: makeApiStub(),
        missionId: 'dark_awakening',
        playerId: SOLO_PLAYER_ID,
        isHost: false,
    });
    sessionA.restoreFromInMemorySnapshot(mark);
    const engineA = sessionA.getEngine()!;
    engineA.stop();
    engineA.state.orderMgr.applyOrder(wireOrder);
    const engineASettled = stepUntil(engineA, () => engineA.waitingForOrders != null, 600);
    expect(engineASettled).toBe(true);

    // --- Engine B: full ITS flow (begin -> resolveTarget -> commit). ---
    // Non-host + playahead past the mark forces Step 2's rollback-only path, so `commit()` restores
    // the mark and resubmits — this mock netAdapter delivers that resubmit the way a real non-host
    // BattleNet.submitOrder does (optimistic local apply via `session.applyRemoteOrders`, see
    // BattleNet.ts submitOrder ~line 548-554), so the finalized order actually lands on the engine.
    session.setNetAdapter({
        isOrderSubmitPathAvailable: () => true,
        submitOrder: vi.fn(async (order: BattleOrder, atTick: number) => {
            const idHash = hashOrderId(session.getLocalPlayerId(), atTick, order);
            session.applyRemoteOrders([{ atTick, order, idHash, playerId: session.getLocalPlayerId() }]);
        }),
    } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

    const its = session.interactiveTargeting;
    const began = its.begin(baseOrder, session);
    expect(began).toBe(true);

    for (const label of selectLabels) {
        if (engine.waitingForTargetInput?.label !== label) {
            const paused = stepUntil(engine, () => engine.waitingForTargetInput?.label === label, 300);
            expect(paused).toBe(true);
        }
        its.resolveTarget(label, labelTargets[label]!, session);
    }

    // Non-host: `freezeItsOnLocalPlayerParallelPause` means the sole local waiter's round-end
    // pause commits for real once the ability naturally finishes (it is not dropped the way a
    // host/solo ally-only preview pause is) — so unlike the host-only ITS fixtures elsewhere in
    // this file, we cannot wait for an intermediate "stop pause with waitingForOrders == null"
    // here. Just require genuine playahead past the mark tick, which is all `wouldCommitInPlace`
    // needs to force the rollback path; `commit()` restores from `this.mark` regardless of
    // whatever pause state the live preview has reached by then.
    const ticked = stepUntil(engine, () => engine.gameTick > markTick, 300);
    expect(ticked).toBe(true);

    // Step 2 default: non-host + playahead beyond the mark forces rollback-only commit.
    expect(its.wouldCommitInPlace(session)).toBe(false);

    await its.commit(session);
    const engineB = session.getEngine()!;
    engineB.stop();

    const engineBSettled = stepUntil(engineB, () => engineB.waitingForOrders != null, 600);
    expect(engineBSettled).toBe(true);

    return { engineA, engineB };
}

/** Compare the two engines' next parallel-order pause: gameTick, batch atTick, waiters, fingerprint. */
function assertPreviewCanonEquivalence(engineA: GameEngine, engineB: GameEngine): void {
    const waitersA = (engineA.waitingForOrders?.waiters ?? []).map((w) => w.unitId).sort();
    const waitersB = (engineB.waitingForOrders?.waiters ?? []).map((w) => w.unitId).sort();

    const commonTick = Math.min(engineA.gameTick, engineB.gameTick);
    const entryA = engineA.state.runtimeFingerprintRing.getEntryAt(commonTick);
    const entryB = engineB.state.runtimeFingerprintRing.getEntryAt(commonTick);
    const fpA = entryA ? fingerprintToHex(entryA.fp) : null;
    const fpB = entryB ? fingerprintToHex(entryB.fp) : null;

    expect(engineB.gameTick).toBe(engineA.gameTick);
    expect(engineB.waitingForOrders?.atTick).toBe(engineA.waitingForOrders?.atTick);
    expect(waitersB).toEqual(waitersA);
    expect(fpB).toBe(fpA);
}

describe('preview/canon execution equivalence (Step 5)', () => {
    it('PunchNEW (0120): rollback-committed ITS run matches the canonical wire-order run', async () => {
        const { engineA, engineB } = await runPreviewCanonEquivalence({
            abilityId: PUNCH_ABILITY_ID,
            setup: (caster, engine) => {
                const enemy = createTargetDummyAtWorld(engine, caster.x + 20, caster.y, {
                    id: 'peq_punch_enemy',
                    hp: 100,
                });
                initializeAbilityRuntimeForUnit(enemy);
                engine.addUnit(enemy, 'initialGameSpawn');
                return { [PUNCH_TARGET_LABEL]: { type: 'unit', unitId: enemy.id } };
            },
        });

        assertPreviewCanonEquivalence(engineA, engineB);

        engineA.destroy();
        engineB.destroy();
    });

    it('Double Punch (0116): rollback-committed ITS run matches the canonical wire-order run', async () => {
        const { engineA, engineB } = await runPreviewCanonEquivalence({
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            setup: (caster, engine) => {
                const e1 = createTargetDummyAtWorld(engine, caster.x + 42, caster.y, {
                    id: 'peq_dp_enemy_1',
                    hp: 100,
                });
                initializeAbilityRuntimeForUnit(e1);
                engine.addUnit(e1, 'initialGameSpawn');
                const e2 = createTargetDummyAtWorld(engine, caster.x, caster.y + 45, {
                    id: 'peq_dp_enemy_2',
                    hp: 100,
                });
                initializeAbilityRuntimeForUnit(e2);
                engine.addUnit(e2, 'initialGameSpawn');
                return {
                    [DOUBLE_PUNCH_TARGET_1_LABEL]: { type: 'unit', unitId: e1.id },
                    [DOUBLE_PUNCH_TARGET_2_LABEL]: { type: 'unit', unitId: e2.id },
                };
            },
        });

        assertPreviewCanonEquivalence(engineA, engineB);

        engineA.destroy();
        engineB.destroy();
    });

    it('Digging Claws (0534): rollback-committed ITS run matches the canonical wire-order run', async () => {
        const { engineA, engineB } = await runPreviewCanonEquivalence({
            abilityId: DIGGING_CLAWS_ABILITY_ID,
            setup: (caster, engine) => {
                caster.attachResource(new Movement(), engine.eventBus);
                const dashTarget = { x: caster.x + 60, y: caster.y };
                return { [DIGGING_CLAWS_DASH_LABEL]: { type: 'pixel', position: dashTarget } };
            },
        });

        assertPreviewCanonEquivalence(engineA, engineB);

        engineA.destroy();
        engineB.destroy();
    });

    it('Rock Slide (0537): rollback-committed ITS run matches the canonical wire-order run', async () => {
        const { engineA, engineB } = await runPreviewCanonEquivalence({
            abilityId: ROCK_SLIDE_ABILITY_ID,
            setup: (caster, engine) => {
                const tm = engine.terrainManager!;
                const c = worldToTile(caster.x, caster.y);
                // Rock one tile up and left (within the 2-tile pick range); punch east onto open ground.
                const rock = { col: c.col - 1, row: c.row - 1 };
                const east = { col: c.col + 1, row: c.row };
                tm.grid.set(rock.col, rock.row, TerrainType.Rock);
                tm.grid.set(east.col, east.row, TerrainType.Grass);
                return {
                    [ROCK_SLIDE_ROCK_LABEL]: { type: 'pixel', position: tileCentre(rock) },
                    [ROCK_SLIDE_DIRECTION_LABEL]: { type: 'pixel', position: tileCentre(east) },
                };
            },
        });

        assertPreviewCanonEquivalence(engineA, engineB);

        engineA.destroy();
        engineB.destroy();
    });
});

describe('preview/canon equivalence — ended-early (interrupted) preview cast', () => {
    const LIGHT_BLAST_ID = '0801';
    const KNOCK_SOURCE = { unitId: 'thornbinder', abilityId: '0008' };

    /** Same tier knockback in both engines (the preview and the canonical replay), at the same tick. */
    function knockCaster(engine: GameEngine, casterId: string): void {
        const caster = engine.getUnit(casterId)!;
        const result = tryApplyKnockbackByTier(
            caster,
            4,
            KNOCK_SOURCE,
            caster.x - 30,
            caster.y,
            knockbackCtxFromEngine(engine),
        );
        expect(result.outcome).toBe('applied');
    }

    // it.fails: a host in-place commit forms the caster's next order pause one tick later than the
    // canonical replay (pre-existing for every in-place commit; see "Host in-place ITS commit pauses one
    // tick later" in docs/TODO.md). Drop `.fails` once that is fixed.
    it.fails('Light Blast: in-place commit of an interrupted preview matches a canonical replay of the finalized order (with missing labels)', async () => {
        const session = await mountSoloSession(true);
        const engine = session.getEngine()!;
        const caster = engine.getLocalPlayerUnit()!;
        caster.abilities = [LIGHT_BLAST_ID];
        initializeAbilityRuntimeForUnit(caster);
        const light = new Light();
        caster.attachResource(light, engine.eventBus);
        light.add(LIGHT_BLAST_LIGHT_COST);

        expect(stepUntil(engine, () => engine.waitingForOrders != null, 400)).toBe(true);
        const casterId = caster.id;
        const baseOrder: BattleOrder = { unitId: casterId, abilityId: LIGHT_BLAST_ID, targets: [], endTurn: true };

        const mark = engine.toJSON();
        mark.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();

        // --- Engine B: ITS preview, interrupted before the pick, committed in place. ---
        const persistCommittedOrder = vi.fn().mockResolvedValue(true);
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            persistCommittedOrder,
            // The host checkpoints and fingerprints at the next order pause after the commit.
            saveSnapshotOnPause: vi.fn().mockResolvedValue(undefined),
            queueFingerprint: vi.fn(),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);
        const its = session.interactiveTargeting;
        expect(its.begin(baseOrder, session)).toBe(true);
        engine.stepSimulationFixedTicks(1);
        expect(engine.getUnit(casterId)!.activeAbilities.some((a) => a.abilityId === LIGHT_BLAST_ID)).toBe(true);
        knockCaster(engine, casterId);
        expect(stepUntil(engine, () => isITSPreviewComplete(engine), 200)).toBe(true);
        expect(its.getPreviewCastEndedEarly(engine)).not.toBeNull();
        expect(its.wouldCommitInPlace(session)).toBe(true);

        await its.commit(session);

        expect(persistCommittedOrder).toHaveBeenCalledTimes(1);
        const finalized = persistCommittedOrder.mock.calls[0]![0] as BattleOrder;
        expect(finalized.missingSelectLabels).toEqual(['Target']);
        const engineB = session.getEngine()!;
        expect(engineB).toBe(engine);
        engineB.stop();
        expect(stepUntil(engineB, () => engineB.waitingForOrders != null, 600)).toBe(true);

        // --- Engine A: canonical replay of the finalized order from the mark. ---
        const sessionA = new BattleSession({
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: SOLO_PLAYER_ID,
            isHost: false,
        });
        sessionA.restoreFromInMemorySnapshot(mark);
        const engineA = sessionA.getEngine()!;
        engineA.stop();
        engineA.state.orderMgr.applyOrder(finalized);
        engineA.stepSimulationFixedTicks(1);
        knockCaster(engineA, casterId);
        expect(stepUntil(engineA, () => engineA.waitingForOrders != null, 600)).toBe(true);

        assertPreviewCanonEquivalence(engineA, engineB);
        const casterA = engineA.getUnit(casterId)!;
        const casterB = engineB.getUnit(casterId)!;
        expect(casterB.x).toBe(casterA.x);
        expect(casterB.y).toBe(casterA.y);
        expect(casterB.hp).toBe(casterA.hp);

        engineA.destroy();
        engineB.destroy();
    });
});

describe('preview/canon equivalence — missing-pick resume (updateTargets order)', () => {
    const LIGHT_BLAST_ID = '0801';

    // it.fails: same pre-existing one-tick in-place pause offset as the ended-early case above
    // (docs/TODO.md). Drop `.fails` once that is fixed.
    it.fails('Light Blast: an in-place resume commit matches a canonical replay of the committed updateTargets order from the mark', async () => {
        const session = await mountSoloSession(true);
        const engine = session.getEngine()!;
        const caster = engine.getLocalPlayerUnit()!;
        caster.abilities = [LIGHT_BLAST_ID];
        initializeAbilityRuntimeForUnit(caster);
        const light = new Light();
        caster.attachResource(light, engine.eventBus);
        light.add(LIGHT_BLAST_LIGHT_COST);

        expect(stepUntil(engine, () => engine.waitingForOrders != null, 400)).toBe(true);
        const casterId = caster.id;
        const blastPixel = { x: caster.x + 30, y: caster.y };

        // Committed without its pick: the cast pauses its owner at the select gate.
        engine.state.orderMgr.applyOrder({
            unitId: casterId,
            abilityId: LIGHT_BLAST_ID,
            targets: [],
            targetsByLabel: {},
            missingSelectLabels: ['Target'],
            endTurn: true,
        });
        expect(stepUntil(
            engine,
            () => engine.waitingForOrders != null
                && caster.activeAbilities.some((a) => a.awaitingPickLabel !== undefined),
            400,
        )).toBe(true);

        const mark = engine.toJSON();
        mark.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();

        // --- Engine B: resume ITS at the pause, pick, commit in place. ---
        const persistCommittedOrder = vi.fn().mockResolvedValue(true);
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            persistCommittedOrder,
            // The host checkpoints and fingerprints at the next order pause after the commit.
            saveSnapshotOnPause: vi.fn().mockResolvedValue(undefined),
            queueFingerprint: vi.fn(),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);
        const its = session.interactiveTargeting;
        expect(its.beginResume(casterId, session)).toBe(true);
        its.resolveTarget('Target', { type: 'pixel', position: blastPixel }, session);
        expect(stepUntil(engine, () => isITSPreviewComplete(engine), 300)).toBe(true);
        expect(its.wouldCommitInPlace(session)).toBe(true);

        await its.commit(session);

        expect(persistCommittedOrder).toHaveBeenCalledTimes(1);
        const finalized = persistCommittedOrder.mock.calls[0]![0] as BattleOrder;
        expect(finalized.updateTargets).toBe(true);
        const engineB = session.getEngine()!;
        expect(engineB).toBe(engine);
        engineB.stop();
        expect(stepUntil(engineB, () => engineB.waitingForOrders != null, 600)).toBe(true);

        // --- Engine A: canonical replay of the committed updateTargets order from the mark. ---
        const sessionA = new BattleSession({
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: SOLO_PLAYER_ID,
            isHost: false,
        });
        sessionA.restoreFromInMemorySnapshot(mark);
        const engineA = sessionA.getEngine()!;
        engineA.stop();
        engineA.state.orderMgr.applyOrder(finalized);
        expect(stepUntil(engineA, () => engineA.waitingForOrders != null, 600)).toBe(true);

        assertPreviewCanonEquivalence(engineA, engineB);
        const casterA = engineA.getUnit(casterId)!;
        const casterB = engineB.getUnit(casterId)!;
        expect(casterB.x).toBe(casterA.x);
        expect(casterB.y).toBe(casterA.y);
        expect(casterB.hp).toBe(casterA.hp);

        engineA.destroy();
        engineB.destroy();
    });
});

/**
 * Abilities the generic single-caster/single-dummy-enemy harness below cannot exercise for reasons
 * unrelated to preview/canon equivalence (e.g. they need a pre-existing companion unit or a prior
 * cast to set up their real target). Each entry names the concrete blocker; skipped, not deleted,
 * so a future harness change (or dedicated hand-written case, as PunchNEW/Double Punch/Digging
 * Claws already have above) can pick these back up.
 */
const GENERIC_HARNESS_UNSUPPORTED_ABILITY_IDS: Record<string, string> = {
    '0611': "Beast Claw declares two separate 'Target' select windows (slash1/slash2) sharing one "
        + "label; the harness's single label->pause->resolve loop can't disambiguate the second "
        + "window from the first (see card_defs/utility/0611_BeastClaw/0611Ability.ts).",
    [ROCK_SLIDE_ABILITY_ID]: 'Rock Slide needs an intact rock tile for its first pick (validatePick); '
        + 'the generic harness aims at a dummy on open ground, so the cast fizzles. Covered by the '
        + 'dedicated Rock Slide case above.',
};

describe('preview/canon execution equivalence — all registered abilities (Step 5, generalized)', () => {
    for (const ability of ABILITIES_WITH_SELECT_TARGETS) {
        const skipReason = GENERIC_HARNESS_UNSUPPORTED_ABILITY_IDS[ability.id];
        const testFn = skipReason ? it.skip : it;
        testFn(
            `${ability.id} (${ability.name}): rollback-committed ITS run matches the canonical wire-order run${skipReason ? ` [skipped: ${skipReason}]` : ''}`,
            async () => {
                const { engineA, engineB } = await runPreviewCanonEquivalence({
                    abilityId: ability.id,
                    setup: (caster, engine) => {
                        ensureAbilityResourcesForCaster(caster, ability, engine);
                        const enemy = createTargetDummyAtWorld(engine, caster.x + 24, caster.y, {
                            id: `peq_generic_enemy_${ability.id}`,
                            hp: 500,
                        });
                        initializeAbilityRuntimeForUnit(enemy);
                        engine.addUnit(enemy, 'initialGameSpawn');
                        return buildAiSelectTargets(caster, ability, enemy, engine).targetsByLabel;
                    },
                });

                assertPreviewCanonEquivalence(engineA, engineB);

                engineA.destroy();
                engineB.destroy();
            },
        );
    }
});
