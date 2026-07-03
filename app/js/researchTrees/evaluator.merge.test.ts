import { describe, it, expect } from 'vitest';
import { getCardReplacementsFromResearch, mergeBattleEquipmentIdsFromResearch } from './evaluator';
import { LIGHT_TREE_ID, LIGHT_NODE_CORE } from './trees/light';

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
