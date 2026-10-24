import { describe, it, expect } from 'vitest';
import {
    getDirectCardsFromResearch,
    getRemovedCardsFromResearch,
    getMissionStartResourcesFromResearch,
    mergeBattleEquipmentIdsFromResearch,
} from './evaluator';
import { LIGHT_TREE_ID, LIGHT_NODE_CORE } from './trees/light';
import { BLOOD_MAGE_TREE_ID, BLOOD_MAGE_NODE_CORE } from './trees/blood_mage';
import { GRAVITY_TREE_ID, GRAVITY_NODE_CORE, GRAVITY_NODE_GRAVITY_LOCUS } from './trees/gravity';
import { LIGHT_CORE_MISSION_START_AMOUNT } from '../games/minion_battles/resources/Light';
import { GRAVITY_CORE_MISSION_START_AMOUNT } from '../games/minion_battles/card_defs/09_gravity_core/gravityConstants';

describe('mergeBattleEquipmentIdsFromResearch', () => {
    it('weapon research never changes equipment (sword research leaves sword 013 alone)', () => {
        const out = mergeBattleEquipmentIdsFromResearch(['004', '013'], {
            sword_item: ['swing_sword'],
            charged_rocks_item: ['throw_charged_rock', 'more_power'],
        });
        expect(out.equipmentIds).toEqual(['004', '013']);
    });

    it('still applies core replaceEquippedItem swaps', () => {
        const out = mergeBattleEquipmentIdsFromResearch(['004', '002'], {
            [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
        });
        expect(out.equipmentIds).toContain('017');
        expect(out.equipmentIds).not.toContain('004');
        expect(out.equipmentIds).toContain('002');
    });
});

describe('getRemovedCardsFromResearch', () => {
    it('Light Core research removes Throw Torch (0601)', () => {
        const removed = getRemovedCardsFromResearch({
            [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
        });
        expect(removed.has('0601')).toBe(true);
    });
});

describe('getMissionStartResourcesFromResearch', () => {
    it('Gravity Core research grants starting gravity', () => {
        const grants = getMissionStartResourcesFromResearch({
            [GRAVITY_TREE_ID]: [GRAVITY_NODE_CORE],
        });
        expect(grants.get('gravity')).toBe(GRAVITY_CORE_MISSION_START_AMOUNT);
    });
});

describe('Light Core mission-start Light', () => {
    it('Light Core research grants 2 starting Light', () => {
        const grants = getMissionStartResourcesFromResearch({
            [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
        });
        expect(LIGHT_CORE_MISSION_START_AMOUNT).toBe(2);
        expect(grants.get('light')).toBe(LIGHT_CORE_MISSION_START_AMOUNT);
    });

    it('no Light without Light Core research', () => {
        expect(getMissionStartResourcesFromResearch({}).get('light')).toBeUndefined();
    });
});

describe('getDirectCardsFromResearch', () => {
    it('Light Core research grants Light Blast (0801)', () => {
        const cards = getDirectCardsFromResearch({
            [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
        });
        expect(cards).toContain('0801');
    });

    it('Gravity Core research grants Force Push (0902)', () => {
        const cards = getDirectCardsFromResearch({
            [GRAVITY_TREE_ID]: [GRAVITY_NODE_CORE],
        });
        expect(cards).toContain('0902');
        expect(cards).not.toContain('0901');
    });

    it('Gravity Locus research grants Gravity Locus (0901)', () => {
        const cards = getDirectCardsFromResearch({
            [GRAVITY_TREE_ID]: [GRAVITY_NODE_CORE, GRAVITY_NODE_GRAVITY_LOCUS],
        });
        expect(cards).toContain('0901');
        expect(cards).toContain('0902');
    });

    it('ignores stored research node ids that no longer exist (removed Blood Ward)', () => {
        const cards = getDirectCardsFromResearch({
            [BLOOD_MAGE_TREE_ID]: [BLOOD_MAGE_NODE_CORE, 'blood_mage_protect'],
        });
        expect(cards).toContain('0301');
        expect(cards).not.toContain('0303');
    });
});
