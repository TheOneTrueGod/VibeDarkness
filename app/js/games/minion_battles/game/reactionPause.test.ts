/**
 * Reaction frames: who gets paused, what the decision costs, and plane identity. Uses the reactable Pod Mortar
 * seed (its telegraph start is a reaction frame) and the generic `requestReactionFrame` entry point.
 */
import { describe, expect, it } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { attachReflexIfKnown } from '../resources/Reflex';
import { ResourceId } from '../resources/resourceIds';
import { KNOWLEDGE_REACTIONS } from '../../../accountKnowledge';
import { spawnFusedBody } from './units/components/fusedBodySpawn';
import { requestReactionFrame } from './reactions/reactionFrame';
import { getAbility } from '../abilities/AbilityRegistry';
import { executeUnitAbility } from './units/unitAbilityLifecycle';
import {
    validateReactionFrames,
    type AbilityTimingEntry,
    type AbilityTimingInterval,
} from '../abilities/abilityTimings';
import { CrystalLaserAbility_1490 } from '../card_defs/14_enemy_court_magician/1490_CrystalLaser/1490Ability';

const P1 = TINY_BATTLE_PLAYER_ID;
const P2 = 'tiny_p2';
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;
const ABILITY = '0104';

interface Setup {
    engine: GameEngine;
    near: Unit;
    far: Unit;
}

function setup(opts: { knows?: boolean; reflex?: boolean } = {}): Setup {
    const engine = buildTinyBattleEngine({ gridW: 40, gridH: 16, localPlayerId: P1, grass: true });
    const near = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(10), y: cell(8), abilities: [ABILITY] });
    const far = spawnTinyPlayerUnit(engine, { playerId: P2, x: cell(30), y: cell(8), abilities: [ABILITY] });
    if (opts.knows ?? true) {
        engine.playerKnowledgeKeysByPlayer = { [P1]: [KNOWLEDGE_REACTIONS], [P2]: [KNOWLEDGE_REACTIONS] };
    }
    if (opts.reflex ?? true) {
        attachReflexIfKnown(near, engine.eventBus, true);
        attachReflexIfKnown(far, engine.eventBus, true);
    }
    return { engine, near, far };
}

function seedAtNear(engine: GameEngine, near: Unit): Unit {
    const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: near.x, y: near.y, unitId: 'seed' });
    if (!seed) throw new Error('no seed');
    return seed;
}

/** Answer an ordinary order plane (no reaction waiters) by waiting everyone, so the sim can continue. */
function answerOrdinaryPlane(engine: GameEngine): void {
    const plane = engine.waitingForOrders;
    if (!plane) return;
    for (const w of plane.waiters) {
        engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
    }
}

/** Step until a plane with a reaction waiter forms, answering ordinary planes on the way. */
function stepToPause(engine: GameEngine, maxSeconds = 8): void {
    for (let i = 0; i < maxSeconds * 60; i++) {
        const plane = engine.waitingForOrders;
        if (plane) {
            if (plane.waiters.some((w) => engine.getUnit(w.unitId)?.reactionPending)) return;
            answerOrdinaryPlane(engine);
        }
        engine.stepSimulationFixedTicks(1);
    }
}

const reflexOf = (u: Unit): number => u.getResource(ResourceId.Reflex)?.current ?? -1;

describe('reaction frame pause', () => {
    it('pauses only the player inside the telegraph', () => {
        const { engine, near, far } = setup();
        seedAtNear(engine, near);
        stepToPause(engine);
        const plane = engine.waitingForOrders!;
        expect(plane.waiters.map((w) => w.unitId)).toEqual([near.id]);
        expect(near.reactionPending).toEqual({ abilityId: 'fused_body', casterId: 'seed' });
        expect(far.reactionPending).toBeUndefined();
        expect(plane.planeId).toMatch(/^\d+:\d+$/);
    });

    it('does not pause without the knowledge or without Reflex', () => {
        const noKnowledge = setup({ knows: false });
        seedAtNear(noKnowledge.engine, noKnowledge.near);
        stepToPause(noKnowledge.engine);
        expect(noKnowledge.near.reactionPending).toBeUndefined();

        const noReflex = setup();
        noReflex.near.getResource(ResourceId.Reflex)!.spend(1);
        const seed = seedAtNear(noReflex.engine, noReflex.near);
        const area = { kind: 'circle', x: noReflex.near.x, y: noReflex.near.y, radius: 40 } as const;
        expect(requestReactionFrame(noReflex.engine, { sourceUnitId: seed.id, area, label: 'x' })).toEqual([]);
        expect(noReflex.near.reactionPending).toBeUndefined();
    });

    it('pass costs nothing and the plane resumes', () => {
        const { engine, near } = setup();
        seedAtNear(engine, near);
        stepToPause(engine);
        engine.state.orderMgr.applyOrder({ unitId: near.id, abilityId: 'wait', targets: [], endTurn: true });
        expect(near.reactionPending).toBeUndefined();
        expect(reflexOf(near)).toBe(1);
        expect(engine.waitingForOrders).toBeNull();
    });

    it('acting spends 1 Reflex and cancels the current cast', () => {
        const { engine, near } = setup();
        seedAtNear(engine, near);
        stepToPause(engine);
        executeUnitAbility(near, getAbility(ABILITY)!, [], engine);
        expect(near.activeAbilities.length).toBeGreaterThan(0);
        const cancelledCast = near.activeAbilities[0]!;
        engine.state.orderMgr.applyOrder({ unitId: near.id, abilityId: ABILITY, targets: [], endTurn: true });
        expect(reflexOf(near)).toBe(0);
        expect(near.reactionPending).toBeUndefined();
        expect(near.activeAbilities.includes(cancelledCast)).toBe(false);
    });

    it('rejects an ability order with no Reflex, leaving the unit pending', () => {
        const { engine, near } = setup();
        seedAtNear(engine, near);
        stepToPause(engine);
        near.getResource(ResourceId.Reflex)!.spend(1);
        engine.state.orderMgr.applyOrder({ unitId: near.id, abilityId: ABILITY, targets: [], endTurn: true });
        expect(near.reactionPending).toBeDefined();
        expect(engine.waitingForOrders).not.toBeNull();
    });

    it('two frames on one tick form one plane', () => {
        const { engine, near, far } = setup();
        engine.stepSimulationFixedTicks(1);
        answerOrdinaryPlane(engine);
        expect(engine.waitingForOrders).toBeNull();
        const src = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(20), y: cell(2), unitId: 'src' })!;
        requestReactionFrame(engine, { sourceUnitId: src.id, area: { kind: 'circle', x: near.x, y: near.y, radius: 40 }, label: 'a' });
        requestReactionFrame(engine, { sourceUnitId: src.id, area: { kind: 'circle', x: far.x, y: far.y, radius: 40 }, label: 'b' });
        engine.stepSimulationFixedTicks(1);
        const plane = engine.waitingForOrders!;
        expect(plane.waiters.map((w) => w.unitId).sort()).toEqual([near.id, far.id].sort());
        expect(engine.pausePlaneCounter).toBe(2);
    });

    it('plane id and reactionPending survive a save/load', () => {
        const { engine, near } = setup();
        seedAtNear(engine, near);
        stepToPause(engine);
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())), P1, engine.terrainManager, {
            checkpointRuntimeFingerprintHex: engine.getRuntimeFingerprintHex(),
        });
        expect(restored.waitingForOrders?.planeId).toBe(engine.waitingForOrders!.planeId);
        expect(restored.pausePlaneCounter).toBe(engine.pausePlaneCounter);
        expect(restored.getUnit(near.id)?.reactionPending).toEqual(near.reactionPending);
    });

    it('Crystal Laser is reactable with a frame on its aim window; reactionFrame needs reactable', () => {
        expect(CrystalLaserAbility_1490.reactable).toBe(true);
        const entries = (CrystalLaserAbility_1490.abilityTimings ?? []) as AbilityTimingEntry[];
        const aim = entries.find((e) => 'id' in e && e.id === 'aim') as AbilityTimingInterval;
        expect(aim.reactionFrame?.at).toBe('start');
        expect(() => validateReactionFrames('x', false, entries)).toThrow();
        expect(() => validateReactionFrames('x', true, entries)).not.toThrow();
    });
});
