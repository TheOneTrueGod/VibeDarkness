/**
 * Co-op Reaction claims: the single gate (`canClaimReaction`), engine-side application (`applyReactionClaim`),
 * plane resume and serialization. The Reactable attack is a Pod Mortar seed whose fuse is running.
 */
import { describe, expect, it } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { attachReflexIfKnown } from '../../resources/Reflex';
import { ResourceId } from '../../resources/resourceIds';
import { KNOWLEDGE_REACTIONS } from '../../../../accountKnowledge';
import { spawnFusedBody } from '../units/components/fusedBodySpawn';
import { peekFusedBodyState } from '../units/components/fusedBodyComponent';
import { requestReactionFrame } from './reactionFrame';
import { applyReactionClaim, canClaimReaction } from './claimRule';

const P1 = TINY_BATTLE_PLAYER_ID;
const P2 = 'tiny_p2';
const P3 = 'tiny_p3';
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;
const ABILITY = '0104';

interface Setup {
    engine: GameEngine;
    near: Unit;
    far: Unit;
    third: Unit;
    seed: Unit;
}

/** A plane opened by a reaction frame on `near` only; `far` and `third` stand outside the telegraph. */
function setupPlane(): Setup {
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
    expect(engine.waitingForOrders).toBeNull();
    const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(20), y: cell(2), unitId: 'seed' })!;
    requestReactionFrame(engine, {
        sourceUnitId: seed.id,
        area: { kind: 'circle', x: near.x, y: near.y, radius: 40 },
        label: 'fused_body',
    });
    engine.stepSimulationFixedTicks(1);
    expect(engine.waitingForOrders?.waiters.map((w) => w.unitId)).toEqual([near.id]);
    return { engine, near, far, third, seed };
}

const planeId = (engine: GameEngine): string => engine.waitingForOrders!.planeId!;
const wait = (engine: GameEngine, unit: Unit): void =>
    engine.state.orderMgr.applyOrder({ unitId: unit.id, abilityId: 'wait', targets: [], endTurn: true });

describe('co-op Reaction claims', () => {
    it('accepts a claim while a Reactable attack is in progress', () => {
        const { engine, near, far, seed } = setupPlane();
        expect(peekFusedBodyState(seed)?.outcome).toBeNull();
        expect(canClaimReaction(engine, far)).toBe(true);
        expect(applyReactionClaim(engine, planeId(engine), far.id)).toBe(true);
        const plane = engine.waitingForOrders!;
        expect(plane.waiters.map((w) => w.unitId).sort()).toEqual([far.id, near.id].sort());
        expect(plane.claims).toEqual([{ unitId: far.id, ownerId: P2 }]);
        expect(far.reactionPending).toEqual({ abilityId: 'fused_body', casterId: 'seed' });
        expect(far.getResource(ResourceId.Reflex)?.current).toBe(1); // claiming is free
        expect(canClaimReaction(engine, far)).toBe(false); // already a waiter
    });

    it('rejects when no Reactable attack is in progress', () => {
        const { engine, far, seed } = setupPlane();
        peekFusedBodyState(seed)!.outcome = 'expired';
        expect(canClaimReaction(engine, far)).toBe(false);
        expect(applyReactionClaim(engine, planeId(engine), far.id)).toBe(false);
        expect(engine.waitingForOrders!.claims).toBeUndefined();
        expect(far.reactionPending).toBeUndefined();
    });

    it('rejects without the knowledge or without Reflex', () => {
        const { engine, far, third } = setupPlane();
        far.getResource(ResourceId.Reflex)!.spend(1);
        expect(applyReactionClaim(engine, planeId(engine), far.id)).toBe(false);
        engine.playerKnowledgeKeysByPlayer = { [P1]: [KNOWLEDGE_REACTIONS] };
        expect(applyReactionClaim(engine, planeId(engine), third.id)).toBe(false);
    });

    it('rejects a stale plane id', () => {
        const { engine, far } = setupPlane();
        expect(applyReactionClaim(engine, '0:0', far.id)).toBe(false);
        expect(far.reactionPending).toBeUndefined();
        expect(engine.waitingForOrders!.claims).toBeUndefined();
    });

    it('accepts two claims on one plane, which resumes only when every waiter has an order', () => {
        const { engine, near, far, third } = setupPlane();
        const id = planeId(engine);
        expect(applyReactionClaim(engine, id, far.id)).toBe(true);
        expect(applyReactionClaim(engine, id, third.id)).toBe(true);
        expect(engine.waitingForOrders!.claims).toHaveLength(2);
        expect(engine.waitingForOrders!.waiters).toHaveLength(3);

        wait(engine, near);
        expect(engine.waitingForOrders).not.toBeNull();
        wait(engine, far);
        expect(engine.waitingForOrders).not.toBeNull();
        wait(engine, third);
        expect(engine.waitingForOrders).toBeNull();
        expect(far.reactionPending).toBeUndefined();
    });

    it('a claimant who acts spends 1 Reflex like any reactor', () => {
        const { engine, far } = setupPlane();
        applyReactionClaim(engine, planeId(engine), far.id);
        engine.state.orderMgr.applyOrder({ unitId: far.id, abilityId: ABILITY, targets: [], endTurn: true });
        expect(far.getResource(ResourceId.Reflex)?.current).toBe(0);
        expect(far.reactionPending).toBeUndefined();
    });

    it('claims survive a save/load', () => {
        const { engine, far } = setupPlane();
        applyReactionClaim(engine, planeId(engine), far.id);
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())), P1, engine.terrainManager, {
            checkpointRuntimeFingerprintHex: engine.getRuntimeFingerprintHex(),
        });
        expect(restored.waitingForOrders?.claims).toEqual([{ unitId: far.id, ownerId: P2 }]);
        expect(restored.getUnit(far.id)?.reactionPending).toEqual(far.reactionPending);
    });
});
