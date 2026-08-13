import { describe, expect, it } from 'vitest';
import {
    initializeAbilityRuntimeForUnit,
    syncNestedCardAbilityState,
} from '../abilities/abilityUses';
import { Unit } from '../game/units/Unit';
import {
    PREP_ABILITY_SLOT_COUNT,
    QUEST_PREP_ABILITY_SLOT_COUNT,
    addQuestPrepAbility,
    buildAccessibleAbilityIds,
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
import { coreEarthItem } from '../character_defs/items/core/019_core_earth';
import { resolveItemCardsToAdd } from '../character_defs/items/resolveItemCardsToAdd';
import { STARTING_WEAPON_ROCKS_NODE_ID } from '../../../researchTrees/trees/startingWeaponNodes';

describe('buildAccessibleAbilityIds', () => {
    it('grants throw_rock from Earth Core when rock weapon research is absent', () => {
        const ids = buildAccessibleAbilityIds([coreEarthItem.id], {});
        expect(ids).toContain(STARTING_WEAPON_ROCKS_NODE_ID);
    });

    it('skips Earth Core throw_rock when Throw Rock is researched', () => {
        expect(
            resolveItemCardsToAdd(coreEarthItem, { crystal_rocks: [STARTING_WEAPON_ROCKS_NODE_ID] }),
        ).not.toContain(STARTING_WEAPON_ROCKS_NODE_ID);
    });

    it('still includes throw_rock from equipped rocks when Throw Rock is researched', () => {
        const ids = buildAccessibleAbilityIds(['019', '001'], {
            crystal_rocks: [STARTING_WEAPON_ROCKS_NODE_ID],
        });
        expect(ids).toContain(STARTING_WEAPON_ROCKS_NODE_ID);
    });

    it('does not grant throw_rock from Earth Core when Charged Rocks is researched', () => {
        const ids = buildAccessibleAbilityIds([coreEarthItem.id, '013'], {
            crystal_rocks: ['charged_rocks'],
        });
        expect(ids).not.toContain(STARTING_WEAPON_ROCKS_NODE_ID);
        expect(ids).toContain('throw_charged_rock');
    });
});

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

    it('expands Throw Charged Rock without duplicating its nested Throw Rock slot', () => {
        expect(expandAttachedAbilityIds(['throw_charged_rock'])).toEqual(['throw_charged_rock']);
    });

    it('still treats Throw Rock as prep-attached when Charged Rock is accessible', () => {
        expect(isAttachedOnlyAbility('throw_rock', ['throw_charged_rock'])).toBe(true);
    });

    it('battle runtime keeps a single Throw Charged Rock bar slot after nested-card sync', () => {
        const unit = new Unit({
            id: 'chip',
            x: 0,
            y: 0,
            teamId: 'player',
            ownerId: '1',
            characterId: 'player',
            abilities: expandAttachedAbilityIds([
                '0101',
                '0120',
                '0601',
                'throw_charged_rock',
                '0111',
            ]),
        });
        initializeAbilityRuntimeForUnit(unit);
        syncNestedCardAbilityState(unit);
        expect(unit.abilities).toEqual(['0101', '0120', '0601', 'throw_charged_rock', '0111']);
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
