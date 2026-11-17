/**
 * Recorded Reaction claims replay from the order stream (Step 15): a claim row reaches the engine through
 * `applyRemoteOrdersFor` (the path every client, the host and a late joiner use) and lands on the right plane,
 * whether the plane is already open or has not formed yet on this engine.
 */
import { describe, expect, it } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import type { BattleSession } from '../BattleSession';
import { applyRemoteOrdersFor } from '../sessionOrders';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { attachReflexIfKnown } from '../../resources/Reflex';
import { KNOWLEDGE_REACTIONS } from '../../../../accountKnowledge';
import { spawnFusedBody } from '../units/components/fusedBodySpawn';
import { requestReactionFrame } from './reactionFrame';
import { buildReactionClaimOrder, reactionClaimOf } from './claimOrder';

const P1 = TINY_BATTLE_PLAYER_ID;
const P2 = 'tiny_p2';
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;

/** Engine with a reaction frame requested on `near`; the plane forms on the next tick. `far` is outside it. */
function buildEngine(): { engine: GameEngine; near: Unit; far: Unit } {
    const engine = buildTinyBattleEngine({ gridW: 40, gridH: 16, localPlayerId: P1, grass: true });
    const near = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(10), y: cell(8), abilities: ['0104'] });
    const far = spawnTinyPlayerUnit(engine, { playerId: P2, x: cell(30), y: cell(8), abilities: ['0104'] });
    engine.playerKnowledgeKeysByPlayer = { [P1]: [KNOWLEDGE_REACTIONS], [P2]: [KNOWLEDGE_REACTIONS] };
    for (const u of [near, far]) attachReflexIfKnown(u, engine.eventBus, true);
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
    return { engine, near, far };
}

/** The slice of BattleSession `applyRemoteOrdersFor` touches. */
function fakeSession(engine: GameEngine): BattleSession {
    return {
        engine,
        interactiveTargeting: { isActive: false },
        appliedRemoteOrderKeys: new Set<string>(),
        isBakedIntoLoadedState: () => false,
        config: { isHost: true, api: { getLobbyClient: () => undefined } },
        emit: () => {},
    } as unknown as BattleSession;
}

describe('recorded Reaction claims replay from the order stream', () => {
    it('wire helpers round-trip and ignore ordinary orders', () => {
        const order = buildReactionClaimOrder('10:3', 'u1');
        expect(reactionClaimOf(order)).toEqual({ planeId: '10:3', unitId: 'u1' });
        expect(reactionClaimOf({ unitId: 'u1', abilityId: 'wait', targets: [] })).toBeNull();
    });

    it('applies a claim row to the open plane at its tick, once', () => {
        const { engine, far } = buildEngine();
        engine.stepSimulationFixedTicks(1);
        const plane = engine.waitingForOrders!;
        const session = fakeSession(engine);
        const row = {
            atTick: plane.atTick,
            playerId: P2,
            idHash: 'claim-1',
            order: buildReactionClaimOrder(plane.planeId!, far.id),
        };
        const first = applyRemoteOrdersFor(session, [row]);
        expect(first.newlyAppliedKeys).toEqual(['claim-1']);
        expect(engine.waitingForOrders!.claims).toEqual([{ unitId: far.id, ownerId: P2 }]);
        expect(far.reactionPending).toBeDefined();
        expect(engine.pendingOrders).toHaveLength(0); // a claim is never a queued order

        const second = applyRemoteOrdersFor(session, [row]);
        expect(second.skippedKeys).toEqual(['claim-1']);
        expect(engine.waitingForOrders!.claims).toHaveLength(1);
    });

    it('holds a claim for a plane that has not formed yet and applies it when the plane commits', () => {
        // Same deterministic setup on a second engine: learn the plane id, then replay from before the plane.
        const probe = buildEngine();
        probe.engine.stepSimulationFixedTicks(1);
        const { atTick, planeId } = probe.engine.waitingForOrders!;

        const { engine, far } = buildEngine();
        expect(engine.waitingForOrders).toBeNull();
        applyRemoteOrdersFor(fakeSession(engine), [
            { atTick, playerId: P2, idHash: 'claim-early', order: buildReactionClaimOrder(planeId!, far.id) },
        ]);
        expect(engine.state.orderMgr.pendingReactionClaims).toHaveLength(1);
        engine.stepSimulationFixedTicks(1);
        expect(engine.waitingForOrders?.planeId).toBe(planeId);
        expect(engine.waitingForOrders?.claims).toEqual([{ unitId: far.id, ownerId: P2 }]);
        expect(engine.waitingForOrders?.waiters.some((w) => w.unitId === far.id)).toBe(true);
        expect(engine.state.orderMgr.pendingReactionClaims).toHaveLength(0);
    });

    it('drops a claim whose plane id does not match the plane at that tick', () => {
        const { engine, far } = buildEngine();
        engine.stepSimulationFixedTicks(1);
        const plane = engine.waitingForOrders!;
        applyRemoteOrdersFor(fakeSession(engine), [
            { atTick: plane.atTick, playerId: P2, idHash: 'claim-stale', order: buildReactionClaimOrder('1:99', far.id) },
        ]);
        expect(engine.waitingForOrders!.claims).toBeUndefined();
        expect(far.reactionPending).toBeUndefined();
    });
});
