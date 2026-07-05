import { describe, it, expect } from 'vitest';
import {
    getDirectCardsFromResearch,
    getCardReplacementsFromResearch,
    getMissionStartResourcesFromResearch,
    mergeBattleEquipmentIdsFromResearch,
} from './evaluator';
import { LIGHT_TREE_ID, LIGHT_NODE_CORE } from './trees/light';
import { GRAVITY_TREE_ID, GRAVITY_NODE_CORE, GRAVITY_NODE_GRAVITY_LOCUS } from './trees/gravity';
import { GRAVITY_CORE_MISSION_START_AMOUNT } from '../games/minion_battles/card_defs/09_gravity_core/gravityConstants';

describe('mergeBattleEquipmentIdsFromResearch', () => {
    it('replaces stick (002) with crafted sword (015) when craft_sword is researched', () => {
        const out = mergeBattleEquipmentIdsFromResearch(['004', '002'], {
            stick_sword: ['craft_sword'],
        });
        expect(out.equipmentIds).toContain('015');
        expect(out.equipmentIds).not.toContain('002');
        expect(out.equipmentIds).toContain('004');
    });
});

describe('getCardReplacementsFromResearch', () => {
    it('Light Core research replaces Throw Torch (0601) with Light Blast (0801)', () => {
        const replacements = getCardReplacementsFromResearch({
            [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
        });
        expect(replacements.get('0601')).toBe('0801');
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

describe('getDirectCardsFromResearch', () => {
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
});
