/**
 * Co-op Reaction claims over the mesh (Step 16): `ReactionClaimController` on a host and a claimant, wired to each
 * other directly, over a real engine whose open plane was formed by a reaction frame (Pod Mortar seed).
 */
import { describe, expect, it, vi } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { attachReflexIfKnown } from '../../resources/Reflex';
import { KNOWLEDGE_REACTIONS } from '../../../../accountKnowledge';
import { spawnFusedBody } from '../units/components/fusedBodySpawn';
import { requestReactionFrame } from '../reactions/reactionFrame';
import { evaluateReactionClaimRequest } from '../reactions/claimRule';
import { ReactionClaimController, type ReactionClaimControllerDeps } from './ReactionClaimController';
import type { BattleSessionHandle, ReactionClaimMessage } from './types';

const P1 = TINY_BATTLE_PLAYER_ID; // host, inside the telegraph
const P2 = 'tiny_p2';
const P3 = 'tiny_p3';
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;
const ABILITY = '0104';

function setupPlane() {
    const engine = buildTinyBattleEngine({ gridW: 40, gridH: 16, localPlayerId: P1, grass: true });
    const near = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(10), y: cell(8), abilities: [ABILITY] });
    const far = spawnTinyPlayerUnit(engine, { playerId: P2, x: cell(30), y: cell(8), abilities: [ABILITY] });
    const third = spawnTinyPlayerUnit(engine, { playerId: P3, x: cell(30), y: cell(12), abilities: [ABILITY] });
    engine.playerKnowledgeKeysByPlayer = {
        [P1]: [KNOWLEDGE_REACTIONS],
        [P2]: [KNOWLEDGE_REACTIONS],
        [P3]: [KNOWLEDGE_REACTIONS],
    };
    for (const u of [near, far, third]) attachReflexIfKnown(u, engine.eventBus, true);
    engine.stepSimulationFixedTicks(1);
    for (const w of engine.waitingForOrders?.waiters ?? []) {
        engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
    }
    const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(20), y: cell(2), unitId: 'seed' })!;
    requestReactionFrame(engine, {
        sourceUnitId: seed.id,
        area: { kind: 'circle', x: near.x, y: near.y, radius: 40 },
        label: 'fused_body',
    });
    engine.stepSimulationFixedTicks(1);
    expect(engine.waitingForOrders?.waiters.map((w) => w.unitId)).toEqual([near.id]);
    return { engine, near, far, third };
}

/** The slice of `BattleSessionHandle` the controller reads, backed by `engine`. */
function sessionFor(engine: GameEngine, engineTick?: () => number): BattleSessionHandle {
    const handle: Pick<
        BattleSessionHandle,
        | 'getEngineTick'
        | 'getWaitingForOrdersBatch'
        | 'evaluateReactionClaim'
        | 'hasReactionClaimBeenApplied'
        | 'retryParallelResume'
    > = {
        getEngineTick: engineTick ?? (() => engine.gameTick),
        getWaitingForOrdersBatch: () => engine.waitingForOrders,
        evaluateReactionClaim: (planeId, atTick, unitId, claimantPlayerId) =>
            evaluateReactionClaimRequest(engine, { planeId, atTick, unitId, claimantPlayerId }),
        hasReactionClaimBeenApplied: (planeId, unitId) => engine.state.orderMgr.hasAppliedReactionClaim(planeId, unitId),
        retryParallelResume: () => engine.tryResumeParallel(),
    };
    return handle as unknown as BattleSessionHandle;
}

const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

interface Rig {
    engine: GameEngine;
    near: Unit;
    far: Unit;
    third: Unit;
    host: ReactionClaimController;
    claimant: ReactionClaimController;
    thirdCtl: ReactionClaimController;
    resync: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
    /** Messages the host sent (result broadcasts). */
    hostSent: ReactionClaimMessage[];
    dropResults: { on: boolean };
}

function makeRig(opts: { record?: (c: { planeId: string; atTick: number; unitId: string }) => Promise<boolean> } = {}): Rig {
    const { engine, near, far, third } = setupPlane();
    const resync = vi.fn();
    const hostSent: ReactionClaimMessage[] = [];
    const dropResults = { on: false };
    const record = vi.fn(
        opts.record ??
            (async (c: { planeId: string; atTick: number; unitId: string }) => {
                engine.state.orderMgr.queueReactionClaim(c.atTick, c.planeId, c.unitId);
                return true;
            }),
    );
    const mk = (playerId: string, isHost: boolean, send: ReactionClaimControllerDeps['send']) =>
        new ReactionClaimController({
            isHost,
            playerId,
            hostPlayerId: P1,
            session: sessionFor(engine),
            send,
            isHostLinkUp: () => true,
            recordClaim: (c) => record(c),
            requestResync: resync,
            onChanged: () => {},
        });
    const controllers: Record<string, ReactionClaimController> = {};
    const toPeers = (from: string, m: ReactionClaimMessage): void => {
        for (const [id, ctl] of Object.entries(controllers)) if (id !== from) ctl.handleMessage(from, m);
    };
    controllers[P1] = mk(P1, true, (m) => {
        hostSent.push(m);
        if (m.kind === 'reaction-claim-result' && dropResults.on) return;
        toPeers(P1, m);
    });
    controllers[P2] = mk(P2, false, (m) => toPeers(P2, m));
    controllers[P3] = mk(P3, false, (m) => toPeers(P3, m));
    engine.setParallelResumeHold((plane) => controllers[P1]!.isUndecidedFor(plane.planeId));
    return {
        engine,
        near,
        far,
        third,
        host: controllers[P1]!,
        claimant: controllers[P2]!,
        thirdCtl: controllers[P3]!,
        resync,
        record,
        hostSent,
        dropResults,
    };
}

const waitOrder = (engine: GameEngine, unit: Unit): void =>
    engine.state.orderMgr.applyOrder({ unitId: unit.id, abilityId: 'wait', targets: [], endTurn: true });

describe('Reaction claim messages (Step 16)', () => {
    it('request then accept: recorded, applied, result reaches the claimant and peers', async () => {
        const r = makeRig();
        const planeId = r.engine.waitingForOrders!.planeId!;
        expect(r.claimant.requestClaim(r.far.id)).toBe(true);
        expect(r.thirdCtl.getClaims(planeId).map((c) => c.unitId)).toEqual([r.far.id]); // peers hear the request
        await flush();
        expect(r.record).toHaveBeenCalledTimes(1);
        expect(r.claimant.getState(planeId, r.far.id)).toBe('accepted');
        expect(r.thirdCtl.getState(planeId, r.far.id)).toBe('accepted');
        expect(r.engine.waitingForOrders!.claims).toEqual([{ unitId: r.far.id, ownerId: P2 }]);
    });

    it('request then reject (record fails): claimant gives up, nothing applied, plane can still resume', async () => {
        const r = makeRig({ record: async () => false });
        const planeId = r.engine.waitingForOrders!.planeId!;
        expect(r.claimant.requestClaim(r.far.id)).toBe(true);
        await flush();
        expect(r.claimant.getState(planeId, r.far.id)).toBe('rejected');
        expect(r.engine.waitingForOrders!.claims).toBeUndefined();
        waitOrder(r.engine, r.near);
        expect(r.engine.waitingForOrders).toBeNull();
    });

    it('holds the plane while a request is undecided: the owner acting first does not close it', async () => {
        let release!: (ok: boolean) => void;
        const gate = new Promise<boolean>((res) => {
            release = res;
        });
        const r = makeRig({
            record: async (c) => {
                const ok = await gate;
                if (ok) r.engine.state.orderMgr.queueReactionClaim(c.atTick, c.planeId, c.unitId);
                return ok;
            },
        });
        const planeId = r.engine.waitingForOrders!.planeId!;
        r.claimant.requestClaim(r.far.id);
        expect(r.host.isUndecidedFor(planeId)).toBe(true);
        waitOrder(r.engine, r.near); // every waiter has an order, but the claim is undecided
        expect(r.engine.waitingForOrders).not.toBeNull();
        release(true);
        await flush();
        // Accepted before the plane could close: it now waits for the claimant too.
        expect(r.engine.waitingForOrders).not.toBeNull();
        expect(r.claimant.getState(planeId, r.far.id)).toBe('accepted');
        waitOrder(r.engine, r.far);
        expect(r.engine.waitingForOrders).toBeNull();
    });

    it('a rejected undecided request releases the hold and the plane resumes', async () => {
        let release!: (ok: boolean) => void;
        const gate = new Promise<boolean>((res) => {
            release = res;
        });
        const r = makeRig({ record: () => gate });
        r.claimant.requestClaim(r.far.id);
        waitOrder(r.engine, r.near);
        expect(r.engine.waitingForOrders).not.toBeNull();
        release(false);
        await flush();
        expect(r.engine.waitingForOrders).toBeNull();
    });

    it('a request arriving after the plane closed is rejected', async () => {
        const r = makeRig();
        const planeId = r.engine.waitingForOrders!.planeId!;
        const atTick = r.engine.waitingForOrders!.atTick;
        waitOrder(r.engine, r.near);
        expect(r.engine.waitingForOrders).toBeNull();
        // The claimant's own gate refuses to send...
        expect(r.claimant.requestClaim(r.far.id)).toBe(false);
        // ...and a request that was already in flight is rejected by the host.
        r.host.handleMessage(P2, { kind: 'reaction-claim-request', planeId, atTick, unitId: r.far.id });
        await flush();
        expect(r.record).not.toHaveBeenCalled();
        expect(r.hostSent).toContainEqual({
            kind: 'reaction-claim-result',
            planeId,
            atTick,
            unitId: r.far.id,
            accepted: false,
        });
    });

    it('two requests on one plane are both accepted', async () => {
        const r = makeRig();
        const planeId = r.engine.waitingForOrders!.planeId!;
        r.claimant.requestClaim(r.far.id);
        r.thirdCtl.requestClaim(r.third.id);
        await flush();
        expect(r.claimant.getState(planeId, r.far.id)).toBe('accepted');
        expect(r.thirdCtl.getState(planeId, r.third.id)).toBe('accepted');
        expect(r.engine.waitingForOrders!.claims).toHaveLength(2);
    });

    it('a lost result is recovered from the merged state', async () => {
        const r = makeRig();
        const planeId = r.engine.waitingForOrders!.planeId!;
        r.dropResults.on = true;
        r.claimant.requestClaim(r.far.id);
        await flush();
        // The host applied the claim (it is in engine state); the claimant never heard back.
        expect(r.engine.waitingForOrders!.claims).toHaveLength(1);
        expect(r.claimant.getState(planeId, r.far.id)).toBe('accepted');
    });

    it('a close of an earlier plane does not cancel a pending claim; the matching close does', async () => {
        const r = makeRig({ record: () => new Promise<boolean>(() => {}) }); // never decided
        const planeId = r.engine.waitingForOrders!.planeId!;
        r.claimant.requestClaim(r.far.id);
        r.claimant.handlePlaneClosed('1:1');
        expect(r.claimant.getState(planeId, r.far.id)).toBe('pending');
        r.claimant.handlePlaneClosed(planeId);
        expect(r.claimant.getState(planeId, r.far.id)).toBe('rejected');
        // Another player's pending claim is simply dropped when its plane closes.
        expect(r.thirdCtl.getState(planeId, r.far.id)).toBe('pending');
        r.thirdCtl.handlePlaneClosed(planeId);
        expect(r.thirdCtl.getState(planeId, r.far.id)).toBeNull();
    });

    it('ignores a result for another plane id and results that do not come from the host', async () => {
        const r = makeRig({ record: () => new Promise<boolean>(() => {}) });
        const planeId = r.engine.waitingForOrders!.planeId!;
        const atTick = r.engine.waitingForOrders!.atTick;
        r.claimant.requestClaim(r.far.id);
        r.claimant.handleMessage(P1, {
            kind: 'reaction-claim-result',
            planeId: 'other',
            atTick,
            unitId: r.far.id,
            accepted: true,
        });
        expect(r.claimant.getState(planeId, r.far.id)).toBe('pending');
        r.claimant.handleMessage(P3, {
            kind: 'reaction-claim-result',
            planeId,
            atTick,
            unitId: r.far.id,
            accepted: true,
        });
        expect(r.claimant.getState(planeId, r.far.id)).toBe('pending');
    });

    it('does not send when the mesh link to the host is down', () => {
        const { engine, far } = setupPlane();
        const send = vi.fn();
        const ctl = new ReactionClaimController({
            isHost: false,
            playerId: P2,
            hostPlayerId: P1,
            session: sessionFor(engine),
            send,
            isHostLinkUp: () => false,
            recordClaim: async () => true,
            requestResync: () => {},
            onChanged: () => {},
        });
        expect(ctl.requestClaim(far.id)).toBe(false);
        expect(send).not.toHaveBeenCalled();
    });

    it('an accepted claim for a plane this client already ran past requests a resync', () => {
        const { engine, far } = setupPlane();
        const planeId = engine.waitingForOrders!.planeId!;
        const atTick = engine.waitingForOrders!.atTick;
        waitOrder(engine, engine.getUnit(engine.waitingForOrders!.waiters[0]!.unitId)!);
        expect(engine.waitingForOrders).toBeNull();
        const resync = vi.fn();
        const ctl = new ReactionClaimController({
            isHost: false,
            playerId: P2,
            hostPlayerId: P1,
            session: sessionFor(engine, () => atTick + 5),
            send: () => {},
            isHostLinkUp: () => true,
            recordClaim: async () => true,
            requestResync: resync,
            onChanged: () => {},
        });
        ctl.handleMessage(P1, { kind: 'reaction-claim-result', planeId, atTick, unitId: far.id, accepted: true });
        expect(resync).toHaveBeenCalledWith('reaction-claim-played-ahead');
    });
});
