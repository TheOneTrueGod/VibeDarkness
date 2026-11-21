/**
 * ITS rewind view: while a card click would rewind a preview, the cards keep showing live state but judge
 * uses and costs at the rewind target (the ITS mark): `unusable_at_rewind` when usable now but not there,
 * enabled when spent now but usable there. Real decision frames judge live. The round bar keeps moving.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BattleSession } from './BattleSession';
import { PlayerInteractionManager } from './interaction/PlayerInteractionManager';
import { getRewindTargetUnit, getRewindUnusableCause } from './interaction/itsHandView';
import { getAbilityDisabledReason, getDisabledReasonDisplay } from '../ui/components/abilityDisabledReason';
import type { BattleSessionEvent } from './BattleSession';
import type { AbilityStatic } from '../abilities/Ability';
import type { Unit } from './units/Unit';
import type { GameRenderer } from './GameRenderer/GameRenderer';
import type { GameEngine } from './GameEngine';
import type { SerializedGameState } from './types';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import { getAbility } from '../abilities/AbilityRegistry';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import { FIXED_DT } from './gameConstants';
import { TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';

const THROW_ROCK_ID = 'throw_rock';
const PUNCH_ID = '0120';

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

function stepUntil(engine: GameEngine, done: () => boolean, maxSteps = 400): boolean {
    for (let i = 0; i < maxSteps; i++) {
        if (done()) return true;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
    return done();
}

async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Card disabled reason as the ability bar computes it while previewing. */
function cardReason(live: Unit, rewindUnit: Unit | null, ability: AbilityStatic) {
    return getAbilityDisabledReason({
        playerUnit: live,
        ability,
        abilityId: ability.id,
        currentUses: live.abilityRuntime[ability.id]?.currentUses ?? 0,
        isMyTurn: true,
        allUnits: [live],
        rewind: rewindUnit ? { unit: rewindUnit, abilityName: 'Throw Rock' } : null,
    });
}

describe('ITS rewind view during a preview', () => {
    let session: BattleSession | null = null;

    afterEach(() => {
        session?.destroy();
        session = null;
    });

    /** Pause with Throw Rock + Punch; `punchUsesAtMark` is Punch's uses when the preview begins. */
    async function mountFixture(punchUsesAtMark: number) {
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
        player.abilities = [THROW_ROCK_ID, PUNCH_ID];
        initializeAbilityRuntimeForUnit(player);
        const unitId = player.id;
        stepUntil(engine, () => engine.waitingForOrders?.waiters.some((w) => w.unitId === unitId) ?? false);
        engine.getUnit(unitId)!.abilityRuntime[PUNCH_ID].currentUses = punchUsesAtMark;

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
        mgr.setWaitingForOrders(engine.waitingForOrders);
        mgr.setMyAbilityIds([THROW_ROCK_ID, PUNCH_ID]);

        // Begin the Throw Rock preview and play a few frames of its windup.
        mgr.activateAbilityTargeting(0, getAbility(THROW_ROCK_ID)!);
        await flush();
        const its = session.interactiveTargeting;
        expect(its.isActive).toBe(true);
        const previewEngine = session.getEngine()!;
        const markTick = previewEngine.gameTick;
        stepUntil(previewEngine, () => previewEngine.gameTick > markTick + 3, 20);
        return { session, its, unitId, previewEngine, mgr: session.getInteractionManager() ?? mgr };
    }

    it('a card refilled during the preview shows unusable_at_rewind, and swapping to it is refused', async () => {
        const { its, unitId, previewEngine, mgr } = await mountFixture(0);
        const live = previewEngine.getUnit(unitId)!;
        // Stand-in for a round boundary crossed in the windup that refills Punch.
        live.abilityRuntime[PUNCH_ID].currentUses = 1;
        const punch = getAbility(PUNCH_ID)!;

        const rewindUnit = getRewindTargetUnit(previewEngine, its, live);
        expect(rewindUnit).not.toBeNull();
        expect(rewindUnit).not.toBe(live);
        expect(getRewindUnusableCause(rewindUnit!, punch)).toEqual({ kind: 'uses' });

        const reason = cardReason(live, rewindUnit, punch);
        expect(reason?.reason_id).toBe('unusable_at_rewind');
        expect(getDisabledReasonDisplay(reason!).title).toBe('No Uses Before Throw Rock');

        expect(mgr.swapItsPreviewAbility(1, punch)).toBe(false);
        await flush();
        expect(its.abilityId).toBe(THROW_ROCK_ID);
    });

    it('a card spent during the preview stays enabled and can be swapped to, since the rewind restores it', async () => {
        const { session: s, its, unitId, previewEngine, mgr } = await mountFixture(1);
        const live = previewEngine.getUnit(unitId)!;
        live.abilityRuntime[PUNCH_ID].currentUses = 0;
        const punch = getAbility(PUNCH_ID)!;

        expect(cardReason(live, getRewindTargetUnit(previewEngine, its, live), punch)).toBeNull();
        expect(mgr.swapItsPreviewAbility(1, punch)).toBe(true);
        await flush();
        expect(its.abilityId).toBe(PUNCH_ID);
        expect(s.getEngine()!.getUnit(unitId)!.abilityRuntime[PUNCH_ID].currentUses).toBeGreaterThan(0);
    });

    it('a card with no uses at either point keeps the ordinary no-uses reason', async () => {
        const { its, unitId, previewEngine } = await mountFixture(0);
        const live = previewEngine.getUnit(unitId)!;
        const reason = cardReason(live, getRewindTargetUnit(previewEngine, its, live), getAbility(PUNCH_ID)!);
        expect(reason?.reason_id).toBe('no_uses_remaining');
    });

    it('a cost the rewind target cannot pay names the resource', async () => {
        const { its, unitId, previewEngine } = await mountFixture(1);
        const live = previewEngine.getUnit(unitId)!;
        const rewindUnit = getRewindTargetUnit(previewEngine, its, live)!;
        const costly = { ...getAbility(PUNCH_ID)!, hpCost: 5 } as AbilityStatic;
        live.hp = 50;
        rewindUnit.hp = 3;
        const reason = cardReason(live, rewindUnit, costly);
        expect(reason).toMatchObject({ reason_id: 'unusable_at_rewind', resourceId: 'hp' });
        expect(getDisabledReasonDisplay(reason!).title).toBe('Not Enough Health Before Throw Rock');
    });

    it('the rewind target keeps its resources, so a cost it can pay stays enabled (Dodge during a combo)', async () => {
        const { its, unitId, previewEngine } = await mountFixture(1);
        const live = previewEngine.getUnit(unitId)!;
        const liveMovement = live.getResource('movement_points');
        expect(liveMovement?.current).toBeGreaterThanOrEqual(1);
        const rewindUnit = getRewindTargetUnit(previewEngine, its, live)!;
        expect(rewindUnit.getResource('movement_points')?.current).toBe(liveMovement!.current);
        const movementCost = {
            ...getAbility(PUNCH_ID)!,
            resourceCost: { resourceId: 'movement_points', amount: 1 },
        } as AbilityStatic;
        expect(cardReason(live, rewindUnit, movementCost)).toBeNull();
    });

    it('judges live at a reaction pause that froze the preview', async () => {
        const { its, unitId, previewEngine } = await mountFixture(0);
        const live = previewEngine.getUnit(unitId)!;
        live.reactionPending = { abilityId: PUNCH_ID, casterId: 'enemy' };
        expect(getRewindTargetUnit(previewEngine, its, live)).toBeNull();
    });

    it('keeps sending round progress to the UI during the preview', async () => {
        const { session: s, previewEngine } = await mountFixture(1);
        const events: BattleSessionEvent[] = [];
        const unsubscribe = s.subscribe((ev) => events.push(ev));
        // The frame loop calls this after draining fixed steps; tests step by hand, so call it directly.
        previewEngine.onStateChanged?.();
        unsubscribe();
        expect(previewEngine.isSequentialTargetingPreview).toBe(true);
        expect(events.some((ev) => ev.type === 'round_progress')).toBe(true);
    });
});

describe('getRewindTargetUnit decision frames', () => {
    function fakeEngine(liveUnit: unknown, previewCast: { unitId: string; abilityId: string } | null): GameEngine {
        return {
            gameTick: 10,
            sequentialTargetingPreviewCast: previewCast,
            state: { orderMgr: { pendingOrders: [] } },
            getUnit: () => liveUnit,
        } as unknown as GameEngine;
    }

    const mark = { units: [], gameTick: 5 } as unknown as SerializedGameState;

    it('is null with no preview running', () => {
        const live = { id: 'u1', activeAbilities: [] };
        const engine = fakeEngine(live, null);
        const its = { isActive: false, previewOrderQueued: false, isResumeMode: false, unitId: null, mark: null };
        expect(getRewindTargetUnit(engine, its, live as never)).toBeNull();
    });

    it('is null when the preview stopped on a Combo / Entombed decision', () => {
        const live = { id: 'u1', activeAbilities: [{ abilityId: 'throw_knife', conditionalCancelPaused: true }] };
        const engine = fakeEngine(live, { unitId: 'u1', abilityId: 'throw_knife' });
        const its = { isActive: true, previewOrderQueued: true, isResumeMode: false, unitId: 'u1', mark };
        expect(getRewindTargetUnit(engine, its, live as never)).toBeNull();
    });

    it('is null in missing-pick resume mode', () => {
        const live = { id: 'u1', activeAbilities: [] };
        const engine = fakeEngine(live, { unitId: 'u1', abilityId: 'throw_knife' });
        const its = { isActive: true, previewOrderQueued: true, isResumeMode: true, unitId: 'u1', mark };
        expect(getRewindTargetUnit(engine, its, live as never)).toBeNull();
    });
});

