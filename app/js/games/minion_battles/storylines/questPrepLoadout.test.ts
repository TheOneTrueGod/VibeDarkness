import { describe, expect, it } from 'vitest';
import {
    PREP_ABILITY_SLOT_COUNT,
    QUEST_PREP_ABILITY_SLOT_COUNT,
    addQuestPrepAbility,
    expandAttachedAbilityIds,
    filterSelectableQuestPrepAbilityIds,
    isAttachedOnlyAbility,
    isMissionPrepAbilityReady,
    isMissionPrepReadOnly,
    isQuestPrepSlotsFull,
    isSecondaryAbility,
    needsMissionAbilitySelection,
    removeQuestPrepAbility,
    resolveInitialMissionSelection,
} from './questPrepLoadout';

describe('Quest Prep slot helpers', () => {
    it('enforces PREP_ABILITY_SLOT_COUNT primary slots', () => {
        let selected: string[] = [];
        for (let i = 0; i < PREP_ABILITY_SLOT_COUNT; i++) {
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

    it('treats secondary-tagged Imbued Bat as non-selectable', () => {
        expect(isSecondaryAbility('0803')).toBe(true);
        expect(isSecondaryAbility('0802')).toBe(false);
        expect(filterSelectableQuestPrepAbilityIds(['0803', '0115'])).toEqual(['0115']);
    });
});

describe('mission Prepare Carefully helpers', () => {
    it('requires selection only when over the primary slot cap', () => {
        expect(needsMissionAbilitySelection(PREP_ABILITY_SLOT_COUNT)).toBe(false);
        expect(needsMissionAbilitySelection(PREP_ABILITY_SLOT_COUNT + 1)).toBe(true);
        expect(isMissionPrepReadOnly(3)).toBe(true);
        expect(isMissionPrepReadOnly(PREP_ABILITY_SLOT_COUNT + 1)).toBe(false);
    });

    it('auto-selects all selectable when under/at cap', () => {
        expect(resolveInitialMissionSelection(['a', 'b'], ['x'])).toEqual(['a', 'b']);
    });

    it('pre-selects remembered abilities that are still selectable when over cap', () => {
        const selectable = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        expect(resolveInitialMissionSelection(selectable, ['h', 'g', 'missing', 'a'])).toEqual([
            'h',
            'g',
            'a',
        ]);
    });

    it('auto-selects the first PREP_ABILITY_SLOT_COUNT when over cap with no previous loadout', () => {
        const selectable = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        expect(resolveInitialMissionSelection(selectable, [])).toEqual(
            selectable.slice(0, PREP_ABILITY_SLOT_COUNT),
        );
        expect(resolveInitialMissionSelection(selectable, ['missing'])).toEqual(
            selectable.slice(0, PREP_ABILITY_SLOT_COUNT),
        );
    });

    it('gates ready on a full primary loadout when over cap', () => {
        const selectable = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        expect(isMissionPrepAbilityReady(['a', 'b'], selectable)).toBe(false);
        const full = selectable.slice(0, PREP_ABILITY_SLOT_COUNT);
        expect(isMissionPrepAbilityReady(full, selectable)).toBe(true);
    });

    it('gates ready on all selectable when under/at cap', () => {
        expect(isMissionPrepAbilityReady(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
        expect(isMissionPrepAbilityReady(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
    });
});
