/**
 * Combo auto-continue: at a Combo pause whose cast has `conditionalCancelFollowUp === 'same_ability'`,
 * the same ability's follow-up preview starts by itself (`PlayerInteractionManager.maybeAutoContinueCombo`).
 * Session-level, so it covers the manager rebuild that an ITS rewind causes.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BattleSession } from './BattleSession';
import { PlayerInteractionManager } from './interaction/PlayerInteractionManager';
import type { GameRenderer } from './GameRenderer/GameRenderer';
import type { GameEngine } from './GameEngine';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import { getAbility } from '../abilities/AbilityRegistry';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import { FIXED_DT } from './gameConstants';
import { TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import { ONE_PIXEL_TARGET } from '../card_defs/throwSharedTimings';
import { isAtConditionalCancelDecision, isAtFollowUpPreview } from './interaction/isITSPreviewComplete';

const KNIFE_ID = 'throw_knife';
const ROCK_ID = 'throw_rock';
const KNIFE_LABEL = ONE_PIXEL_TARGET[0]!.label;

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

function makeApiStub(): MinionBattlesApi {
    return {
        setCurrentPlayerId: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }),
    } as unknown as MinionBattlesApi;
}

function stepUntil(engine: GameEngine, done: () => boolean, maxSteps = 600): boolean {
    for (let i = 0; i < maxSteps; i++) {
        if (done()) return true;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
    return done();
}

async function flush(): Promise<void> {
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('Combo auto-continue', () => {
    let session: BattleSession | null = null;

    afterEach(() => {
        session?.destroy();
        session = null;
    });

    async function mountFixture(opts?: { knifeUnlimited?: boolean; abilities?: string[] }) {
        session = new BattleSession({
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: TINY_BATTLE_PLAYER_ID,
            isHost: true,
        });
        await session.load({
            players: { [TINY_BATTLE_PLAYER_ID]: { id: TINY_BATTLE_PLAYER_ID, name: 'P1', color: '#fff' } },
            characterSelections: { [TINY_BATTLE_PLAYER_ID]: 'warrior' },
            battleSeed: 1,
        });
        const engine = session.getEngine()!;
        engine.stop();
        const player = engine.getLocalPlayerUnit()!;
        const abilities = opts?.abilities ?? [KNIFE_ID, ROCK_ID];
        player.abilities = abilities;
        if (opts?.knifeUnlimited !== false) {
            player.abilityModifiers = { [KNIFE_ID]: { comboUnlimited: true } };
        }
        initializeAbilityRuntimeForUnit(player);
        const unitId = player.id;
        stepUntil(engine, () => engine.waitingForOrders?.waiters.some((w) => w.unitId === unitId) ?? false);
        expect(engine.waitingForOrders).not.toBeNull();
        // In-place commits (a Combo follow-up commits the previous preview where it stands) need the order path.
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            persistCommittedOrder: vi.fn(() => ({ queued: true, landed: Promise.resolve(true) })),
            saveSnapshotOnPause: vi.fn(async () => {}),
            submitOrder: vi.fn(async () => {}),
            hasDeferredOrderFor: () => false,
            queueFingerprint: vi.fn(async () => {}),
            isReactionClaimUndecidedFor: () => false,
            handleParallelPlaneClosed: vi.fn(),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);


        const mgr = session.getInteractionManager() ?? new PlayerInteractionManager();
        if (!session.getInteractionManager()) {
            mgr.setContext({
                engine,
                camera: session.camera!,
                renderer: { setDebugUnitOutline: () => {} } as unknown as GameRenderer,
                session,
                playerId: TINY_BATTLE_PLAYER_ID,
            });
        }
        mgr.setCanUseOrderUi(true);
        mgr.setMyAbilityIds(abilities);
        mgr.setWaitingForOrders(engine.waitingForOrders);
        return { session, engine, unitId, mgr, abilities };
    }

    /** Begin knife 1's preview, aim it, and play to its Combo pause (ITS still active, preview done). */
    async function playKnifeOneToComboPause(f: Awaited<ReturnType<typeof mountFixture>>) {
        const { session: s, unitId } = f;
        const its = s.interactiveTargeting;
        f.mgr.activateAbilityTargeting(0, getAbility(KNIFE_ID)!);
        await flush();
        expect(its.isActive).toBe(true);
        expect(its.abilityId).toBe(KNIFE_ID);
        const eng = s.getEngine()!;
        expect(stepUntil(eng, () => eng.waitingForTargetInput?.label === KNIFE_LABEL)).toBe(true);
        const caster = eng.getUnit(unitId)!;
        its.resolveTarget(KNIFE_LABEL, { type: 'pixel', position: { x: caster.x + 160, y: caster.y } }, s);
        expect(
            stepUntil(eng, () => caster.activeAbilities.some((a) => a.conditionalCancelPaused)),
        ).toBe(true);
        return { its, eng, caster };
    }

    it('starts knife 2 by itself at knife 1\'s combo pause, with the pause as its mark', async () => {
        const f = await mountFixture();
        const { its, eng, caster } = await playKnifeOneToComboPause(f);
        const pause = caster.activeAbilities.find((a) => a.conditionalCancelPaused)!;
        expect(pause.conditionalCancelFollowUp).toBe('same_ability');
        const pauseTick = eng.gameTick;
        expect(isAtConditionalCancelDecision(eng, f.unitId, its)).toBe(true);

        // The ITS progress poll calls this when a preview is done at a Combo pause.
        const mgr = f.session.getInteractionManager() ?? f.mgr;
        expect(mgr.maybeAutoContinueCombo()).toBe(true);
        await flush();

        expect(its.isActive).toBe(true);
        expect(its.abilityId).toBe(KNIFE_ID);
        expect(its.savedLocalTick).toBe(pauseTick);
        expect(Object.keys(its.collectedTargets)).toHaveLength(0);
    });

    it('Undo returns to the pause and does not restart the preview', async () => {
        const f = await mountFixture();
        const { its, eng } = await playKnifeOneToComboPause(f);
        const pauseTick = eng.gameTick;
        const before = f.session.getInteractionManager() ?? f.mgr;
        expect(before.maybeAutoContinueCombo()).toBe(true);
        await flush();
        expect(its.isActive).toBe(true);

        await its.reset(f.session, 'ui_reset', 'user_reset');
        await flush();
        expect(its.isActive).toBe(false);
        expect(f.session.getEngine()!.gameTick).toBe(pauseTick);

        // The rewind rebuilt the manager; the new one must remember the plane via the ITS session.
        const after = f.session.getInteractionManager()!;
        expect(after).not.toBe(before);
        after.adoptOrderUiState({
            canUseOrderUi: true,
            myAbilityIds: f.abilities,
            abilityModeResolver: null,
        });
        expect(after.maybeAutoContinueCombo()).toBe(false);
        await flush();
        expect(its.isActive).toBe(false);
    });

    it('swapping to another ability from the auto-started preview works', async () => {
        const f = await mountFixture();
        const { its } = await playKnifeOneToComboPause(f);
        const mgr = f.session.getInteractionManager() ?? f.mgr;
        expect(mgr.maybeAutoContinueCombo()).toBe(true);
        await flush();
        expect(its.abilityId).toBe(KNIFE_ID);

        (f.session.getInteractionManager() ?? mgr).activateAbilityTargeting(1, getAbility(ROCK_ID)!);
        await flush();

        expect(its.isActive).toBe(true);
        expect(its.abilityId).toBe(ROCK_ID);
    });

    it('does not auto-continue when the pause has no follow-up default (Entombed-style)', async () => {
        const f = await mountFixture();
        const { its, caster } = await playKnifeOneToComboPause(f);
        for (const a of caster.activeAbilities) delete a.conditionalCancelFollowUp;
        const mgr = f.session.getInteractionManager() ?? f.mgr;
        const toolBefore = its.abilityId;
        expect(mgr.maybeAutoContinueCombo()).toBe(false);
        await flush();
        expect(its.abilityId).toBe(toolBefore);
        expect(its.hasComboFollowUpStarted(`${f.unitId}:${f.session.getEngine()!.waitingForOrders!.atTick}`)).toBe(false);
    });

    it('does not auto-continue when the card is not in the hand', async () => {
        const f = await mountFixture();
        await playKnifeOneToComboPause(f);
        const mgr = f.session.getInteractionManager() ?? f.mgr;
        mgr.setMyAbilityIds([ROCK_ID]);
        expect(mgr.maybeAutoContinueCombo()).toBe(false);
    });

    it('does not auto-continue when the caster cannot cast the ability now', async () => {
        const f = await mountFixture();
        const { caster } = await playKnifeOneToComboPause(f);
        const mgr = f.session.getInteractionManager() ?? f.mgr;
        // Same gate as executeUnitAbility / activateAbilityTargeting: no uses left.
        caster.abilityRuntime[KNIFE_ID]!.currentUses = 0;
        expect(mgr.maybeAutoContinueCombo()).toBe(false);
    });

    it('does not auto-continue when the local order UI is unusable (remote / AI never auto-continue)', async () => {
        const f = await mountFixture();
        await playKnifeOneToComboPause(f);
        const mgr = f.session.getInteractionManager() ?? f.mgr;
        mgr.setCanUseOrderUi(false);
        expect(mgr.maybeAutoContinueCombo()).toBe(false);
    });

    it('Pass during the auto-started follow-up preview rewinds, ends the combo, and leaves no ITS active', async () => {
        const f = await mountFixture();
        const { its, eng } = await playKnifeOneToComboPause(f);
        const pauseTick = eng.gameTick;
        const before = f.session.getInteractionManager() ?? f.mgr;
        expect(before.maybeAutoContinueCombo()).toBe(true);
        await flush();
        expect(its.isActive).toBe(true);
        expect(isAtFollowUpPreview(its)).toBe(true);
        // The preview is mid-run (not at a decision): Pass used to be blocked here ('its_preview_active').

        const submitted = vi.spyOn(f.session, 'submitPlayerOrder');
        before.handleWait();
        await flush();

        expect(its.isActive).toBe(false);
        expect(isAtFollowUpPreview(its)).toBe(false);
        const after = f.session.getInteractionManager()!;
        expect(after).not.toBe(before);
        expect(f.session.getEngine()!.gameTick).toBeGreaterThanOrEqual(pauseTick);
        // Plane memory stopped auto-continue from restarting the preview after the rebuild.
        expect(after.maybeAutoContinueCombo()).toBe(false);
        expect(its.isActive).toBe(false);

        // Exactly one order was submitted (no follow-up knife): the `wait` that ends the combo. Tests bypass
        // BattleNet, so apply it the way the net layer would.
        const eng2 = f.session.getEngine()!;
        const caster2 = eng2.getUnit(f.unitId)!;
        expect(submitted).toHaveBeenCalledTimes(1);
        const waitOrder = submitted.mock.calls[0]![0];
        expect(waitOrder.abilityId).toBe('wait');
        expect(waitOrder.endTurn).toBe(true);
        eng2.setOnParallelBatchResolved(null); // no host persistence in this harness
        eng2.state.orderMgr.applyOrder(waitOrder);
        eng2.tryResumeParallel();
        await flush();
        // The wait resumes knife 1: it plays out and finishes with no new preview or follow-up.
        stepUntil(eng2, () => !caster2.activeAbilities.some((a) => a.abilityId === KNIFE_ID), 900);
        expect(caster2.activeAbilities.some((a) => a.abilityId === KNIFE_ID)).toBe(false);
        expect(its.isActive).toBe(false);
    });
});
