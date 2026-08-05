import { describe, expect, it } from 'vitest';
import {
    QUEST_PREP_ABILITY_SLOT_COUNT,
    addQuestPrepAbility,
    expandAttachedAbilityIds,
    filterSelectableQuestPrepAbilityIds,
    isAttachedOnlyAbility,
    isQuestPrepSlotsFull,
    removeQuestPrepAbility,
} from './questPrepLoadout';

describe('Quest Prep slot helpers', () => {
    it('enforces QUEST_PREP_ABILITY_SLOT_COUNT primary slots', () => {
        let selected: string[] = [];
        for (let i = 0; i < QUEST_PREP_ABILITY_SLOT_COUNT; i++) {
            selected = addQuestPrepAbility(selected, `abil_${i}`);
        }
        expect(selected).toHaveLength(QUEST_PREP_ABILITY_SLOT_COUNT);
        expect(isQuestPrepSlotsFull(selected)).toBe(true);
        expect(addQuestPrepAbility(selected, 'abil_extra')).toEqual(selected);
    });

    it('does not duplicate an already selected primary', () => {
        const selected = addQuestPrepAbility(['0101'], '0101');
        expect(selected).toEqual(['0101']);
    });

    it('removeQuestPrepAbility drops the primary only', () => {
        expect(removeQuestPrepAbility(['0101', '0120'], '0101')).toEqual(['0120']);
    });
});

describe('attached ability expansion', () => {
    it('expands Light Imbuement with Imbued Bat', () => {
        expect(expandAttachedAbilityIds(['0802'])).toEqual(['0802', '0803']);
    });

    it('expands Throw Charged Rock with Throw Rock', () => {
        expect(expandAttachedAbilityIds(['throw_charged_rock'])).toEqual([
            'throw_charged_rock',
            'throw_rock',
        ]);
    });

    it('treats attached companions as non-selectable when parent is accessible', () => {
        const accessible = ['0802', '0803', '0115'];
        expect(isAttachedOnlyAbility('0803', accessible)).toBe(true);
        expect(filterSelectableQuestPrepAbilityIds(accessible)).toEqual(['0802', '0115']);
    });
});
