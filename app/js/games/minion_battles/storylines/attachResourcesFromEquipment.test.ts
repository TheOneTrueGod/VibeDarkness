import { describe, expect, it } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit } from '../testing/harness/buildTinyBattleEngine';
import { attachResourcesFromEquipment } from './BaseMissionDef';
import {
    BLOOD_CORE_WATER_MAX,
    BLOOD_CORE_WATER_START,
    coreBloodMageItem,
} from '../character_defs/items/core/022_core_blood_mage';
import { coreEarthItem } from '../character_defs/items/core/019_core_earth';
import { ResourceId } from '../resources/resourceIds';

function spawn() {
    const engine = buildTinyBattleEngine({ gridW: 6, gridH: 6, localPlayerId: 'p1', grass: true });
    const player = spawnTinyPlayerUnit(engine, { playerId: 'p1', x: 100, y: 100, abilities: [] });
    return { engine, player };
}

describe('attachResourcesFromEquipment: item resource grants', () => {
    it('the Blood Mage core gives Water 10 max and 6 starting', () => {
        expect(BLOOD_CORE_WATER_MAX).toBe(10);
        expect(BLOOD_CORE_WATER_START).toBe(6);
        const { engine, player } = spawn();
        attachResourcesFromEquipment([coreBloodMageItem.id], player, engine.eventBus);
        const water = player.getResource(ResourceId.Water);
        expect(water?.max).toBe(10);
        expect(water?.current).toBe(6);
    });

    it('a core without a Water grant leaves the unit with no Water, whatever its abilities cost', () => {
        const { engine, player } = spawn();
        attachResourcesFromEquipment([coreEarthItem.id], player, engine.eventBus);
        expect(player.getResource(ResourceId.Water)).toBeUndefined();
    });
});
