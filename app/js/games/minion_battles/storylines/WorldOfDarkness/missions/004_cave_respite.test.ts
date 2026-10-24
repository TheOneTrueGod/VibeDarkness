import { describe, expect, it } from 'vitest';
import { CAVE_RESPITE } from './004_cave_respite';
import { resolveUnlockedTierItemIds } from '../../unlockItemTiers';
import { TRAINING_NODE_CHARGING_PUNCH, TRAINING_TREE_ID } from '../../../../../researchTrees/trees/training';

function punchRowIds(equipped: string[]): string[] {
    return CAVE_RESPITE.getPostMissionChoiceOptions!({
        choiceId: 'cave_respite_punch_choice',
        equippedItemIds: equipped,
    })!.map((r) => r.id);
}

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
