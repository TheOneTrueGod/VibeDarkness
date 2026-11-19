/**
 * ITS swap: clicking another ability card during a preview rewinds to the mark and starts the new
 * ability's preview (`PlayerInteractionManager.swapItsPreviewAbility`). Session-level, so it covers the
 * manager rebuild that `restoreFromInMemorySnapshot` causes.
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

describe('ITS swap to another ability during a preview', () => {
    let session: BattleSession | null = null;

    afterEach(() => {
        session?.destroy();
        session = null;
    });

    async function mountSwapFixture() {
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
        expect(engine.waitingForOrders).not.toBeNull();

        // Headless load builds no manager (no camera/renderer yet); the first restore does. Start with one by hand.
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
        return { session, engine, unitId, mgr };
    }

    async function flush(): Promise<void> {
        for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    }

    it('rewinds to the mark and starts the new ability preview; old targets are gone', async () => {
        const { session: s, engine, mgr } = await mountSwapFixture();
        const its = s.interactiveTargeting;
        const markTick = engine.gameTick;

        mgr.activateAbilityTargeting(0, getAbility(THROW_ROCK_ID)!);
        await flush();
        expect(its.isActive).toBe(true);
        expect(its.abilityId).toBe(THROW_ROCK_ID);
        const throwEngine = s.getEngine()!;
        stepUntil(throwEngine, () => throwEngine.gameTick > markTick + 3, 20);
        expect(throwEngine.gameTick).toBeGreaterThan(markTick);

        // Clicking the card on the manager the UI holds (session's current).
        (s.getInteractionManager() ?? mgr).activateAbilityTargeting(1, getAbility(PUNCH_ID)!);
        await flush();

        expect(its.isActive).toBe(true);
        expect(its.abilityId).toBe(PUNCH_ID);
        expect(Object.keys(its.collectedTargets)).toHaveLength(0);
        // The new preview began from the mark; it has not been ticked past it yet.
        expect(s.getEngine()!.gameTick).toBeLessThanOrEqual(markTick + 1);
    });

    it('swapping to the ability already being previewed is a no-op', async () => {
        const { session: s, engine, mgr } = await mountSwapFixture();
        const its = s.interactiveTargeting;
        mgr.activateAbilityTargeting(0, getAbility(THROW_ROCK_ID)!);
        await flush();
        expect(its.isActive).toBe(true);
        const tickBefore = s.getEngine()!.gameTick;
        const engineBefore = s.getEngine();

        (s.getInteractionManager() ?? mgr).activateAbilityTargeting(0, getAbility(THROW_ROCK_ID)!);
        await flush();

        expect(its.isActive).toBe(true);
        expect(its.abilityId).toBe(THROW_ROCK_ID);
        expect(s.getEngine()).toBe(engineBefore);
        expect(s.getEngine()!.gameTick).toBe(tickBefore);
        expect(engine).toBe(engineBefore);
    });

    it('does not swap while a swap is already rewinding', async () => {
        const { session: s, mgr } = await mountSwapFixture();
        const its = s.interactiveTargeting;
        mgr.activateAbilityTargeting(0, getAbility(THROW_ROCK_ID)!);
        await flush();
        const cur = s.getInteractionManager() ?? mgr;
        expect(cur.swapItsPreviewAbility(1, getAbility(PUNCH_ID)!)).toBe(true);
        expect(cur.swapItsPreviewAbility(1, getAbility(PUNCH_ID)!)).toBe(false);
        await flush();
        expect(its.abilityId).toBe(PUNCH_ID);
    });
});
