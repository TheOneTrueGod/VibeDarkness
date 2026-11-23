/**
 * Exile (`exile.ts`): a unit temporarily out of play. It leaves `units`, returns at a point, by timer, or when its
 * anchor dies, and round-trips through the snapshot.
 */
import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import '../../abilities/AbilityRegistry';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { FIXED_DT } from '../gameConstants';
import { GameEngine } from '../GameEngine';
import type { UnitExiledEvent, UnitReturnedEvent } from '../EventBus';
import { getLivingPetsOfUnit } from './petHelpers';
import { spawnPetForOwner } from './petSpawn';
import type { Unit } from './Unit';

function step(engine: GameEngine, seconds: number): void {
    for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

function battle() {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    const spirit = spawnPetForOwner(engine, player, {
        petDefId: 'spirit_clone',
        at: { x: 240, y: 200 },
        abilityIds: [],
        maxHp: 30,
        spawnSource: 'abilitySpawn',
    })!;
    engine.waitingForOrders = null;
    engine.isPaused = false;
    step(engine, 0.5);
    return { engine, player, spirit };
}

describe('exile', () => {
    it('an exiled unit leaves units, getUnit and the owner\'s living pets, and emits unit_exiled', () => {
        const { engine, player, spirit } = battle();
        expect(getLivingPetsOfUnit(player, engine.units)).toContain(spirit);
        const events: UnitExiledEvent[] = [];
        engine.eventBus.on('unit_exiled', (e) => events.push(e));

        expect(engine.exileUnit(spirit, { reason: 'test' })).toBe(true);

        expect(engine.units).not.toContain(spirit);
        expect(engine.getUnit(spirit.id)).toBeUndefined();
        expect(getLivingPetsOfUnit(player, engine.units)).not.toContain(spirit);
        expect(engine.getExiledUnit(spirit.id)).toBe(spirit);
        expect(engine.getExiledUnits().map((r) => r.unit.id)).toEqual([spirit.id]);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ unitId: spirit.id, reason: 'test', anchorUnitId: null });
        // Stays out of play across ticks.
        step(engine, 0.5);
        expect(engine.getUnit(spirit.id)).toBeUndefined();
    });

    it('returnExiledUnit puts the unit back in units at the point and emits unit_returned', () => {
        const { engine, spirit } = battle();
        const events: UnitReturnedEvent[] = [];
        engine.eventBus.on('unit_returned', (e) => events.push(e));
        engine.exileUnit(spirit, { reason: 'test' });

        expect(engine.returnExiledUnit(spirit.id, { x: 123, y: 321 })).toBe(true);

        expect(engine.getUnit(spirit.id)).toBe(spirit);
        expect(engine.getExiledUnit(spirit.id)).toBeUndefined();
        expect(spirit.x).toBe(123);
        expect(spirit.y).toBe(321);
        expect(spirit.movement).toBeFalsy();
        expect(events).toEqual([{ unitId: spirit.id, reason: 'test', x: 123, y: 321, anchorUnitId: null }]);
    });

    it('returnExiledUnit on a unit that is not exiled does nothing', () => {
        const { engine, spirit } = battle();
        const events: UnitReturnedEvent[] = [];
        engine.eventBus.on('unit_returned', (e) => events.push(e));
        const countBefore = engine.units.length;

        expect(engine.returnExiledUnit(spirit.id, { x: 1, y: 1 })).toBe(false);
        expect(engine.returnExiledUnit('nobody')).toBe(false);

        expect(engine.units).toHaveLength(countBefore);
        expect(events).toHaveLength(0);
    });

    it('a returnAtGameTime brings the unit back when it is reached', () => {
        const { engine, spirit } = battle();
        engine.exileUnit(spirit, { reason: 'test', returnAtGameTime: engine.gameTime + 1 });

        step(engine, 0.5);
        expect(engine.getUnit(spirit.id)).toBeUndefined();
        step(engine, 0.75);
        expect(engine.getUnit(spirit.id)).toBe(spirit);
        expect(engine.getExiledUnits()).toHaveLength(0);
    });

    it('the anchor\'s death returns the unit at the anchor\'s position', () => {
        const { engine, spirit } = battle();
        const anchor = placeTargetDummy(engine, { x: 320, y: 280 }, 'anchor');
        engine.exileUnit(spirit, { reason: 'test', anchorUnitId: anchor.id });
        step(engine, 0.2);
        expect(engine.getUnit(spirit.id)).toBeUndefined();

        anchor.takeDamage(anchor.hp + 1000, null, engine.eventBus);
        expect(anchor.isAlive()).toBe(false);
        step(engine, 0.2);

        expect(engine.getUnit(spirit.id)).toBe(spirit);
        expect(spirit.x).toBe(320);
        expect(spirit.y).toBe(280);
    });

    it('toJSON then fromJSON keeps the exiled record, and the unit can still return', () => {
        const { engine, spirit } = battle();
        const anchor = placeTargetDummy(engine, { x: 320, y: 280 }, 'anchor');
        const returnAt = engine.gameTime + 30;
        engine.exileUnit(spirit, { reason: 'guard', anchorUnitId: anchor.id, returnAtGameTime: returnAt });
        step(engine, 0.2);

        const json = engine.toJSON();
        expect(json.units.map((u) => u.id)).not.toContain(spirit.id);
        expect(json.exiledUnits).toHaveLength(1);

        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(json)), TINY_BATTLE_PLAYER_ID, engine.terrainManager);
        const records = restored.getExiledUnits();
        expect(records).toHaveLength(1);
        const record = records[0]!;
        expect(record.unit.id).toBe(spirit.id);
        expect(record).toMatchObject({
            reason: 'guard',
            anchorUnitId: anchor.id,
            returnAtGameTime: returnAt,
            anchorLastX: 320,
            anchorLastY: 280,
        });
        expect(restored.getUnit(spirit.id)).toBeUndefined();

        expect(restored.returnExiledUnit(spirit.id)).toBe(true);
        const back = restored.getUnit(spirit.id) as Unit;
        expect(back.x).toBe(320);
        expect(back.y).toBe(280);
    });

    it('a snapshot with no exiled units omits the key and loads without it', () => {
        const { engine } = battle();
        const json = engine.toJSON();
        expect(json.exiledUnits).toBeUndefined();
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(json)), TINY_BATTLE_PLAYER_ID, engine.terrainManager);
        expect(restored.getExiledUnits()).toHaveLength(0);
    });
});
