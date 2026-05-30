import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../../../types';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import { BattleSession } from './BattleSession';
import { resetGameObjectIdCounter } from './GameObject';

const FIXED_DT = 1 / 60;

beforeAll(() => {
    if (globalThis.requestAnimationFrame === undefined) {
        vi.stubGlobal(
            'requestAnimationFrame',
            (_cb: FrameRequestCallback) => 0 as unknown as number,
        );
        vi.stubGlobal('cancelAnimationFrame', (_id: number) => {});
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

async function createSession(playerId: string, battleSeed: number): Promise<BattleSession> {
    const session = new BattleSession({
        api: makeApiStub(),
        missionId: 'dark_awakening',
        playerId,
        isHost: true,
    });
    const players: Record<string, PlayerState> = {
        p1: { id: 'p1', name: 'P1', color: '#fff' },
        p2: { id: 'p2', name: 'P2', color: '#000' },
    };
    const characterSelections = { p1: 'warrior', p2: 'ranger' };
    await session.load({ players, characterSelections, battleSeed });
    session.getEngine()?.stop();
    return session;
}

describe('lockstep determinism', () => {
    it('keeps matching fingerprints for independent runs with identical scripted orders', async () => {
        const runTrace = async (): Promise<{ initialFingerprint: string; trace: string[] }> => {
            resetGameObjectIdCounter(1);
            const session = await createSession('p1', 424242);
            const engine = session.getEngine();
            if (!engine) {
                throw new Error('expected session to load engine');
            }
            const trace: string[] = [];
            while (engine.gameTick < 200) {
                (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
                const waiting = engine.waitingForOrders;
                if (waiting) {
                    for (const waiter of waiting.waiters) {
                        if (engine.state.orderMgr.hasPendingOrderForUnit(waiter.unitId, waiting.atTick)) continue;
                        const unit = engine.getUnit(waiter.unitId);
                        if (!unit) continue;
                        const baseCol = Math.floor(unit.x / 40);
                        const baseRow = Math.floor(unit.y / 40);
                        const moveDelta = (waiting.atTick + waiter.unitId.length) % 2 === 0 ? 1 : -1;
                        engine.state.orderMgr.queueOrder(waiting.atTick, {
                            unitId: waiter.unitId,
                            abilityId: 'wait',
                            targets: [],
                            movePath: [{ col: baseCol + moveDelta, row: baseRow }],
                        });
                    }
                    engine.tryResumeParallel();
                }
                if (engine.gameTick > 0 && engine.gameTick % 10 === 0) {
                    trace.push(session.getLatestFingerprint()?.fp ?? '');
                }
            }
            const result = { initialFingerprint: session.getInitialFingerprint(), trace };
            session.destroy();
            return result;
        };

        const a = await runTrace();
        const b = await runTrace();
        expect(a.initialFingerprint).toBe(b.initialFingerprint);
        expect(a.trace).toEqual(b.trace);
    });
});
