/**
 * ITS Timeline promotion & discard (Step 5 of its-timeline-and-draft-orders.md).
 *
 * Tests:
 * (a) in-place commit (via ITS.commit) keeps engine instance and tick, timeline ends canonical
 * (b) after promotion the net adapter receives buffered fingerprints and checkpoint
 * (c) stale runId to promotePreview is logged and no-op
 * (d) discardPreview with mark restores engine state
 * (e) draft order before ITS begin keeps pause plane after reset (Step 1 regression)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { BattleSession } from '../BattleSession';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import { resetGameObjectIdCounter } from '../GameObject';

const SOLO_PLAYER_ID = 'p1';
const PUNCH_ABILITY_ID = '0120';

function makeApiStub(): MinionBattlesApi {
    return {
        setCurrentPlayerId: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }),
    } as unknown as MinionBattlesApi;
}

async function mountSoloHostSession(): Promise<BattleSession> {
    resetGameObjectIdCounter(1);
    const session = new BattleSession({
        api: makeApiStub(),
        missionId: 'dark_awakening',
        playerId: SOLO_PLAYER_ID,
        isHost: true,
    });
    await session.load({
        players: { [SOLO_PLAYER_ID]: { id: SOLO_PLAYER_ID, name: 'P1', color: '#fff' } },
        characterSelections: { [SOLO_PLAYER_ID]: 'warrior' },
        battleSeed: 1,
    });
    session.getEngine()!.stop();
    return session;
}

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

describe('ITS timeline promotion & discard (Step 5)', () => {
    it('(a) promotePreview keeps same engine instance, clears flags, transitions timeline to canonical', async () => {
        const session = await mountSoloHostSession();
        const engine = session.getEngine()!;

        // Set up net adapter
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            queueFingerprint: vi.fn(),
            saveSnapshotOnPause: vi.fn(() => Promise.resolve()),
            mergeAppliedOrdersForBatch: vi.fn(() => Promise.resolve()),
        } as any);

        const engineBeforePreview = session.getEngine();
        expect(engineBeforePreview).toBe(engine);

        // Manually enter preview (simulate ITS.begin)
        const runId = 1;
        session.enterItsPreview(runId, engine.gameTick, engine.gameTick);
        engine.isSequentialTargetingPreview = true;
        engine.sequentialTargetingPreviewCast = { unitId: 'test', abilityId: PUNCH_ABILITY_ID, startRound: 1 };

        // Timeline should be preview
        const timelineInPreview = session.getTimeline();
        expect(timelineInPreview.kind).toBe('preview');

        // Promote the preview
        session.promotePreview(runId);

        // Engine instance should be the same
        expect(session.getEngine()).toBe(engineBeforePreview);

        // Timeline should be canonical
        const timelineAfter = session.getTimeline();
        expect(timelineAfter.kind).toBe('canonical');

        // Flags should be cleared
        expect(engine.isSequentialTargetingPreview).toBe(false);
        expect(engine.sequentialTargetingPreviewCast).toBe(null);

        engine.destroy();
    });

    it('(b) promotePreview flushes buffered fingerprints and checkpoint to netAdapter', async () => {
        const session = await mountSoloHostSession();
        const engine = session.getEngine()!;

        const fpsQueued: Array<number> = [];
        const checkpointsPosted: Array<number> = [];
        const batchesMerged: Array<number> = [];

        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            queueFingerprint: vi.fn((tick: number) => {
                fpsQueued.push(tick);
            }),
            saveSnapshotOnPause: vi.fn((tick: number) => {
                checkpointsPosted.push(tick);
                return Promise.resolve();
            }),
            mergeAppliedOrdersForBatch: vi.fn((batchAtTick: number) => {
                batchesMerged.push(batchAtTick);
                return Promise.resolve();
            }),
        } as any);

        // Manually enter preview and add emissions to buffer
        const runId = 1;
        session.enterItsPreview(runId, engine.gameTick, engine.gameTick);

        const buffer = session.getPreviewEmissionBuffer()!;
        expect(buffer).toBeDefined();

        // Manually record some emissions
        buffer.recordFingerprint(1, 'fp1', false, undefined, runId);
        buffer.recordFingerprint(2, 'fp2', false, undefined, runId);
        buffer.recordCheckpoint(3, engine.toJSON(), runId);
        buffer.recordResolvedBatch(1, runId);

        // Promote
        session.promotePreview(runId);

        // Fingerprints should have been queued
        expect(fpsQueued).toEqual([1, 2]);

        // Checkpoint should have been saved
        expect(checkpointsPosted).toEqual([3]);

        // Batch should have been merged
        expect(batchesMerged).toEqual([1]);

        // Buffer should be cleared
        expect(session.getPreviewEmissionBuffer()).toBeNull();

        engine.destroy();
    });

    it('(c) stale runId to promotePreview is logged and no-op (owns runId, rejects old one after replay)', async () => {
        const session = await mountSoloHostSession();
        const engine = session.getEngine()!;

        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            queueFingerprint: vi.fn(),
            saveSnapshotOnPause: vi.fn(() => Promise.resolve()),
            mergeAppliedOrdersForBatch: vi.fn(() => Promise.resolve()),
        } as any);

        // Simulate begin/replay lifecycle: enter preview with runId 1, promote to canonical, then re-enter with runId 2
        const runId1 = 1;
        session.enterItsPreview(runId1, engine.gameTick, engine.gameTick);

        // Promote to canonical
        session.promotePreview(runId1);
        expect(session.getTimeline().kind).toBe('canonical');

        // Re-enter preview with new runId (like replay does)
        const runId2 = 2;
        session.enterItsPreview(runId2, engine.gameTick, engine.gameTick);
        expect(session.getTimeline().kind).toBe('preview');
        const bufferAfterReplay = session.getPreviewEmissionBuffer();
        expect(bufferAfterReplay?.runId).toBe(runId2);

        // Try to promote with the old runId (should be stale)
        const logMock = vi.fn();
        const originalLog = session.postBattleSyncLobbyLog.bind(session);
        session.postBattleSyncLobbyLog = function(msg: string, ...args: any[]) {
            logMock(msg, ...args);
            return originalLog(msg, ...args);
        } as any;

        session.promotePreview(runId1); // Old runId - should be no-op

        // Should have logged a diag message about stale runId
        expect(logMock).toHaveBeenCalledWith(
            expect.stringContaining('diag:'),
            expect.anything()
        );

        // Timeline should still be preview with runId2 (no-op, didn't affect current preview)
        const timelineAfter = session.getTimeline();
        expect(timelineAfter.kind).toBe('preview');
        expect((timelineAfter as any).runId).toBe(runId2);

        // Buffer should still have runId2
        expect(session.getPreviewEmissionBuffer()).toBe(bufferAfterReplay);

        engine.destroy();
    });

    it('(d) discardPreview restores engine from mark and transitions to canonical', async () => {
        const session = await mountSoloHostSession();
        const engine = session.getEngine()!;

        const markState = engine.toJSON();
        const markTick = engine.gameTick;

        // Enter preview
        const runId = 1;
        session.enterItsPreview(runId, markTick, markTick);
        expect(session.getTimeline().kind).toBe('preview');

        // Simulate engine advancement
        engine.gameTick = 999;

        // Discard with mark
        session.discardPreview(runId, markState);

        // Timeline should be canonical
        expect(session.getTimeline().kind).toBe('canonical');

        // Engine should be restored (new instance after restoreFromInMemorySnapshot)
        // The mark tick should be restored
        const restoredEngine = session.getEngine()!;
        expect(restoredEngine.gameTick).toBe(markTick);

        // Buffer should be cleared
        expect(session.getPreviewEmissionBuffer()).toBeNull();

        restoredEngine.destroy();
    });

    it('(e) discardPreview with stale runId is logged and no-op', async () => {
        const session = await mountSoloHostSession();
        const engine = session.getEngine()!;

        // Enter preview with runId 1
        const runId1 = 1;
        session.enterItsPreview(runId1, engine.gameTick, engine.gameTick);

        const bufferBefore = session.getPreviewEmissionBuffer();

        // Try to discard with wrong runId
        const logMock = vi.fn();
        session.postBattleSyncLobbyLog = logMock as any;

        const markState = engine.toJSON();
        session.discardPreview(999, markState); // Wrong runId

        // Should have logged a diag message
        expect(logMock).toHaveBeenCalledWith(
            expect.stringContaining('diag:'),
            expect.anything()
        );

        // Timeline should still be preview (no-op)
        expect(session.getTimeline().kind).toBe('preview');

        // Buffer should still exist
        expect(session.getPreviewEmissionBuffer()).toBe(bufferBefore);

        engine.destroy();
    });

    it('(f) _restoreToMark unconditionally restores mark after discarding preview (behavior regression fix)', async () => {
        const session = await mountSoloHostSession();
        const engine = session.getEngine()!;

        const markTick = engine.gameTick;
        const markState = structuredClone(engine.toJSON());

        // Enter preview with runId 1
        const previewRunId = 1;
        session.enterItsPreview(previewRunId, markTick, markTick);
        expect(session.getTimeline().kind).toBe('preview');

        // Simulate engine advancement in preview
        engine.gameTick = markTick + 10;

        // Call discardPreview WITH mark (like _restoreToMark does after checking if preview is active).
        // This should:
        // 1. Drop the buffer
        // 2. Transition timeline to canonical
        // 3. Restore the engine from the mark
        session.discardPreview(previewRunId, markState);

        // Timeline should be canonical
        expect(session.getTimeline().kind).toBe('canonical');

        // Engine should be restored to mark tick (proving the mark was restored)
        const restoredEngine = session.getEngine()!;
        expect(restoredEngine.gameTick).toBe(markTick);

        restoredEngine.destroy();
    });
});
