import { describe, it, expect } from 'vitest';
import { mergeBattleEquipmentIdsFromResearch } from './evaluator';

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
