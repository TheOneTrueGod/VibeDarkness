import { describe, expect, it } from 'vitest';
import { CAVE_RESPITE } from './004_cave_respite';
import { resolveUnlockedTierItemIds } from '../../unlockItemTiers';
import { TRAINING_NODE_CHARGING_PUNCH, TRAINING_TREE_ID } from '../../../../../researchTrees/trees/training';

function researchRows(equipped: string[]) {
    return CAVE_RESPITE.getPostMissionChoiceOptions!({
        choiceId: 'cave_respite_research_choice',
        equippedItemIds: equipped,
        playerId: '2',
    })!;
}

function punchRowIds(equipped: string[]): string[] {
    return CAVE_RESPITE.getPostMissionChoiceOptions!({
        choiceId: 'cave_respite_punch_choice',
        equippedItemIds: equipped,
    })!.map((r) => r.id);
}

describe('Cave Respite research choice', () => {
    it('Crystal Shield: Charged Shield as equip_item plus Strengthening Light research', () => {
        const rows = researchRows(['004', '015']);
        expect(rows.map((r) => r.action)).toEqual([
            { type: 'equip_item', itemId: '016' },
            { type: 'grant_research_to_player', treeId: 'crystal_shield_item', nodeId: 'extra_shields' },
        ]);
    });

    it('Charged Rocks: More Power and More Rock', () => {
        expect(researchRows(['004', '011']).map((r) => r.id)).toEqual(['more_power', 'more_rock']);
    });

    it('Knives: More Rock on the Thrown Weapons tree', () => {
        const rows = researchRows(['004', '012']);
        expect(rows.map((r) => r.action)).toEqual([
            { type: 'grant_research_to_player', treeId: 'thrown_weapons', nodeId: 'more_rock' },
        ]);
    });

    it('Sword: Iron Wrists', () => {
        expect(researchRows(['004', '013']).map((r) => r.id)).toEqual(['sword_extra_uses']);
    });

    it('Mace: Training Regime and Iron Wrists', () => {
        expect(researchRows(['004', '014']).map((r) => r.id)).toEqual(['pipe_bat_damage', 'sword_extra_uses']);
    });

    it('falls back to Core Training for unupgraded weapons', () => {
        expect(researchRows(['004', '001']).map((r) => r.id)).toEqual(['core_training']);
    });
});

describe('Cave Respite punch choice', () => {
    it('offers Charging Punch only with Charged Rocks equipped', () => {
        expect(punchRowIds(['004', '011'])).toContain(TRAINING_NODE_CHARGING_PUNCH);
        expect(punchRowIds(['004', '001'])).not.toContain(TRAINING_NODE_CHARGING_PUNCH);
        expect(TRAINING_TREE_ID).toBeTruthy();
    });
});

describe('Cave Respite rewards', () => {
    it('unlocks the tier-3 weapon on victory', () => {
        expect(resolveUnlockedTierItemIds(CAVE_RESPITE.completionRewards?.unlockItemTiers, CAVE_RESPITE.campaignId)).toEqual([
            '016',
        ]);
    });
});
