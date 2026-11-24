/**
 * A cast that moves its own caster (dash, lunge) ends a walk ordered before that cast, so the unit does not
 * head back to the old destination once the ability lets go (endWalkQueuedBeforeCast). A walk ordered in
 * the same order as the cast is kept. Orders go through OrderManager and re-send the standing walk, as the
 * order UI does (DefaultTool.seedFromUnit).
 */
import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import type { BattleOrder } from '../types';
import type { GameEngine } from '../GameEngine';
import { Movement } from '../../resources/Movement';
import { DodgeAbility } from '../../card_defs/0101_Dodge/0101Ability';
import { CARD_ID as PUNCH_ID } from '../../card_defs/0120_PunchNEW/0120Ability';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { resetGameObjectIdCounter } from '../GameObject';

const P = TINY_BATTLE_PLAYER_ID;
const cell = (c: number) => c * CELL_SIZE + CELL_SIZE / 2;
const START = { col: 8, row: 4 };
const OLD_WALK = [{ col: 2, row: 4 }];

function buildEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    return buildTinyBattleEngine({ gridW: 16, gridH: 8, localPlayerId: P, grass: true });
}

/** Step the sim, answering any order pause with a plain wait (no new move). */
function run(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const w of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
}

function orderWalk(engine: GameEngine, unitId: string): void {
    engine.state.orderMgr.applyOrder({ unitId, abilityId: 'wait', targets: [], movePath: OLD_WALK, endTurn: true });
    run(engine, 5);
}

function dodgeEast(engine: GameEngine, unitId: string, x: number, y: number, movePath: BattleOrder['movePath']): void {
    engine.state.orderMgr.applyOrder({
        unitId,
        abilityId: DodgeAbility.id,
        targets: [{ type: 'pixel', position: { x: x + 200, y } }],
        movePath,
        endTurn: true,
    });
}

describe('caster displacement vs a walk ordered earlier', () => {
    it('Dodge ends the earlier walk even when the order re-sends it', () => {
        const engine = buildEngine();
        const player = spawnTinyPlayerUnit(engine, { playerId: P, x: cell(START.col), y: cell(START.row), abilities: [DodgeAbility.id] });
        player.attachResource(new Movement(), engine.eventBus);

        orderWalk(engine, player.id);
        expect(player.walkIntent?.dest).toEqual(OLD_WALK[0]);
        const xBeforeDodge = player.x;

        dodgeEast(engine, player.id, player.x, player.y, OLD_WALK);
        run(engine, 60);

        expect(player.walkIntent).toBeNull();
        expect(player.movement).toBeNull();
        expect(player.x).toBeGreaterThan(xBeforeDodge + 100);
        engine.destroy();
    });

    it('Dodge keeps a new walk ordered in the same order', () => {
        const engine = buildEngine();
        const player = spawnTinyPlayerUnit(engine, { playerId: P, x: cell(START.col), y: cell(START.row), abilities: [DodgeAbility.id] });
        player.attachResource(new Movement(), engine.eventBus);

        orderWalk(engine, player.id);
        const newWalk = [{ col: 12, row: 1 }];
        dodgeEast(engine, player.id, player.x, player.y, newWalk);
        run(engine, 30);

        expect(player.walkIntent?.dest).toEqual(newWalk[0]);
        engine.destroy();
    });

    function punchFromGap(gapPx: number) {
        const engine = buildEngine();
        const { player, dummy } = placePlayerAndDummy(engine, {
            playerId: P,
            playerWorld: { x: cell(START.col), y: cell(START.row) },
            dummyWorld: { x: cell(START.col) + gapPx, y: cell(START.row) },
            abilities: [PUNCH_ID],
        });
        orderWalk(engine, player.id);
        expect(player.walkIntent?.dest).toEqual(OLD_WALK[0]);
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: PUNCH_ID,
            targets: [{ type: 'unit', unitId: dummy.id }],
            movePath: OLD_WALK,
            endTurn: true,
        });
        return { engine, player };
    }

    it('a punch that lunges ends the earlier walk', () => {
        const { engine, player } = punchFromGap(70);
        run(engine, 120);
        expect(player.walkIntent).toBeNull();
        expect(player.movement).toBeNull();
        engine.destroy();
    });

    it('a punch already in reach does not move the caster, so the walk carries on', () => {
        const { engine, player } = punchFromGap(34);
        run(engine, 30);
        expect(player.walkIntent?.dest).toEqual(OLD_WALK[0]);
        engine.destroy();
    });

    it('serializes walkIntent.issuedTick and ActiveAbility.castTick', () => {
        const engine = buildEngine();
        const player = spawnTinyPlayerUnit(engine, { playerId: P, x: cell(START.col), y: cell(START.row), abilities: [DodgeAbility.id] });
        player.attachResource(new Movement(), engine.eventBus);
        orderWalk(engine, player.id);
        const json = player.toJSON() as { walkIntent?: { issuedTick?: number } };
        expect(json.walkIntent?.issuedTick).toBe(player.walkIntent?.issuedTick);
        expect(typeof json.walkIntent?.issuedTick).toBe('number');

        dodgeEast(engine, player.id, player.x, player.y, undefined);
        const castJson = player.toJSON() as { activeAbilities: { castTick?: number }[] };
        expect(castJson.activeAbilities[0]?.castTick).toBe(engine.gameTick);
        engine.destroy();
    });
});
