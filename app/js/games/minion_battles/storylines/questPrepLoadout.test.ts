import { describe, expect, it } from 'vitest';
import {
    initializeAbilityRuntimeForUnit,
    syncNestedCardAbilityState,
} from '../abilities/abilityUses';
import { Unit } from '../game/units/Unit';
import { getDefaultHp, getDefaultSpeed, PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import {
    PREP_ABILITY_SLOT_COUNT,
    QUEST_PREP_ABILITY_SLOT_COUNT,
    addQuestPrepAbility,
    buildAccessibleAbilityIds,
    equipmentWithEquippedItem,
    expandAttachedAbilityIds,
    fillEmptyPrepSlotsWithNewAbilities,
    filterSelectableQuestPrepAbilityIds,
    isAttachedOnlyAbility,
    isMissionPrepAbilityReady,
    isMissionPrepReadOnly,
    isQuestPrepSlotsFull,
    isSecondaryAbility,
    moveQuestPrepAbility,
    needsMissionAbilitySelection,
    placeQuestPrepAbilityAt,
    prepLoadoutAfterResearchGrant,
    prepLoadoutAfterStoryChoice,
    prepLoadoutPrimaryIdsForResearchGrant,
    prepLoadoutPrimaryIdsForStoryChoice,
    readOnlyPrepSelection,
    removeQuestPrepAbility,
    resolveInitialMissionSelection,
} from './questPrepLoadout';
import { coreEarthItem } from '../character_defs/items/core/019_core_earth';
import { EARTH_NODE_EARTH_CORE, EARTH_NODE_GATHER_STONE, EARTH_TREE_ID } from '../../../researchTrees/trees/earth';
import { STARTING_WEAPON_ROCKS_NODE_ID } from '../../../researchTrees/trees/startingWeaponNodes';

describe('buildAccessibleAbilityIds', () => {
    it('does not grant throw_rock from Earth Core alone', () => {
        const ids = buildAccessibleAbilityIds([coreEarthItem.id], {});
        expect(ids).not.toContain(STARTING_WEAPON_ROCKS_NODE_ID);
        expect(ids).not.toContain('earth_core_throw_rock');
    });

    it('includes throw_rock from equipped rocks', () => {
        const ids = buildAccessibleAbilityIds(['019', '001'], {});
        expect(ids).toContain(STARTING_WEAPON_ROCKS_NODE_ID);
    });

    it('gives throw_charged_rock instead of throw_rock when the Charged Rocks item is equipped', () => {
        const ids = buildAccessibleAbilityIds([coreEarthItem.id, '011'], {});
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

    it('placeQuestPrepAbilityAt swaps an occupied slot and fills an empty one', () => {
        expect(placeQuestPrepAbilityAt(['a', 'b', 'c'], 1, 'x')).toEqual(['a', 'x', 'c']);
        expect(placeQuestPrepAbilityAt(['a', 'b'], 5, 'x')).toEqual(['a', 'b', 'x']);
        // Already-selected ids and bad indexes leave the loadout alone.
        expect(placeQuestPrepAbilityAt(['a', 'b'], 0, 'b')).toEqual(['a', 'b']);
        expect(placeQuestPrepAbilityAt(['a', 'b'], -1, 'x')).toEqual(['a', 'b']);
        // A full loadout only swaps; an "empty" index past the cap does nothing.
        const full = ['1', '2', '3', '4', '5', '6', '7'];
        expect(placeQuestPrepAbilityAt(full, 7, 'x')).toEqual(full);
    });

    it('removeQuestPrepAbility drops the primary only', () => {
        expect(removeQuestPrepAbility(['0101', '0120'], '0101')).toEqual(['0120']);
    });

    it('moveQuestPrepAbility moves a primary into the chosen gap', () => {
        const ids = ['a', 'b', 'c', 'd'];
        expect(moveQuestPrepAbility(ids, 0, 4)).toEqual(['b', 'c', 'd', 'a']);
        expect(moveQuestPrepAbility(ids, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
        expect(moveQuestPrepAbility(ids, 1, 3)).toEqual(['a', 'c', 'b', 'd']);
        expect(moveQuestPrepAbility(ids, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
        // Dropping into the gaps either side of the card itself is a no-op.
        expect(moveQuestPrepAbility(ids, 1, 1)).toEqual(ids);
        expect(moveQuestPrepAbility(ids, 1, 2)).toEqual(ids);
        expect(moveQuestPrepAbility(ids, 5, 0)).toEqual(ids);
    });

    it('readOnlyPrepSelection keeps the chosen order but always holds every selectable', () => {
        expect(readOnlyPrepSelection(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
        expect(readOnlyPrepSelection(['c', 'gone', 'c'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
        expect(readOnlyPrepSelection([], ['a', 'b'])).toEqual(['a', 'b']);
    });
});

describe('attached ability expansion', () => {
    it('expands Gather Light with Imbued Mace when accessible', () => {
        expect(expandAttachedAbilityIds(['0804'], ['0804', '0803'])).toEqual(['0804', '0803']);
    });

    it('does not expand Imbued Mace onto Gather Light when research has not granted it', () => {
        expect(expandAttachedAbilityIds(['0804'], ['0804'])).toEqual(['0804']);
    });

    it('expands Gather Light with Imbued Mace when accessibility is unrestricted', () => {
        expect(expandAttachedAbilityIds(['0804'])).toEqual(['0804', '0803']);
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
            hp: getDefaultHp(PLAYER_CHARACTER_ID),
            speed: getDefaultSpeed(PLAYER_CHARACTER_ID),
            teamId: 'player',
            ownerId: '1',
            characterId: PLAYER_CHARACTER_ID,
            name: 'Chip',
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
        const accessible = ['0804', '0803', '0115'];
        expect(isAttachedOnlyAbility('0803', accessible)).toBe(true);
        expect(filterSelectableQuestPrepAbilityIds(accessible)).toEqual(['0804', '0115']);
    });

    it('treats secondary-tagged Imbued Mace as non-selectable', () => {
        expect(isSecondaryAbility('0803')).toBe(true);
        expect(isSecondaryAbility('0804')).toBe(false);
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

const EARTH_EQUIPMENT = [coreEarthItem.id];
const EARTH_RESEARCH = { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE] };
const EARTH_CARDS = [...coreEarthItem.cardsToAdd, '0111', '0537'];

describe('fill empty prep slots after a research grant', () => {
    it('adds the granted card to an open slot', () => {
        const selected = buildAccessibleAbilityIds(EARTH_EQUIPMENT, EARTH_RESEARCH);
        const next = prepLoadoutAfterResearchGrant({
            selectedPrimaryIds: selected,
            equipment: EARTH_EQUIPMENT,
            researchTrees: EARTH_RESEARCH,
            treeId: EARTH_TREE_ID,
            nodeId: EARTH_NODE_GATHER_STONE,
        });
        expect(next).toEqual([...selected, '0536']);
    });

    it('seeds under-cap primaries then adds the grant when no loadout is stored yet', () => {
        const next = prepLoadoutAfterResearchGrant({
            selectedPrimaryIds: [],
            equipment: EARTH_EQUIPMENT,
            researchTrees: EARTH_RESEARCH,
            treeId: EARTH_TREE_ID,
            nodeId: EARTH_NODE_GATHER_STONE,
        });
        expect(next).toEqual([...EARTH_CARDS, '0536']);
    });

    it('does not backfill abilities the player already skipped', () => {
        expect(
            fillEmptyPrepSlotsWithNewAbilities(
                ['a', 'b'],
                ['a', 'b', 'c', 'd'],
                ['a', 'b', 'c', 'd', 'throw_rock'],
            ),
        ).toEqual(['a', 'b', 'throw_rock']);
    });

    it('does not exceed PREP_ABILITY_SLOT_COUNT', () => {
        const full = Array.from({ length: PREP_ABILITY_SLOT_COUNT }, (_, i) => `abil_${i}`);
        expect(fillEmptyPrepSlotsWithNewAbilities(full, full, [...full, 'new'])).toEqual(full);
    });

    it('returns the filled loadout from prepLoadoutPrimaryIdsForResearchGrant for a stored mission prep', () => {
        const selected = buildAccessibleAbilityIds(EARTH_EQUIPMENT, EARTH_RESEARCH);
        expect(
            prepLoadoutPrimaryIdsForResearchGrant({
                playerId: 'p1',
                characterId: 'c1',
                equipment: EARTH_EQUIPMENT,
                researchTrees: EARTH_RESEARCH,
                treeId: EARTH_TREE_ID,
                nodeId: EARTH_NODE_GATHER_STONE,
                missionPrepLoadoutsByPlayer: { p1: selected },
            }),
        ).toEqual([...selected, '0536']);
    });

    it('hands a no-longer-selectable pick\'s slot to the first new ability', () => {
        expect(fillEmptyPrepSlotsWithNewAbilities(['a', 'old', 'b'], ['a', 'old', 'b'], ['a', 'b', 'new'])).toEqual([
            'a',
            'new',
            'b',
        ]);
    });

    it('returns undefined from prepLoadoutPrimaryIdsForResearchGrant when slots already include the grant', () => {
        const researchTrees = { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE, EARTH_NODE_GATHER_STONE] };
        const selected = buildAccessibleAbilityIds(EARTH_EQUIPMENT, researchTrees);
        expect(
            prepLoadoutPrimaryIdsForResearchGrant({
                playerId: 'p1',
                characterId: 'c1',
                equipment: EARTH_EQUIPMENT,
                researchTrees,
                treeId: EARTH_TREE_ID,
                nodeId: EARTH_NODE_GATHER_STONE,
                missionPrepLoadoutsByPlayer: { p1: selected },
            }),
        ).toBeUndefined();
    });
});

/** Abilities a weapon item adds on top of the Earth Core loadout. */
function weaponAbilityIds(itemId: string): string[] {
    const base = new Set(filterSelectableQuestPrepAbilityIds(buildAccessibleAbilityIds(EARTH_EQUIPMENT, {})));
    return filterSelectableQuestPrepAbilityIds(buildAccessibleAbilityIds([...EARTH_EQUIPMENT, itemId], {})).filter(
        (id) => !base.has(id),
    );
}

describe('prep loadout after a story choice equips an item', () => {
    it.each([
        ['001', 'Rocks'],
        ['002', 'Stick'],
    ])('adds the %s (%s) ability to a stored loadout that predates the item', (itemId) => {
        const selected = filterSelectableQuestPrepAbilityIds(buildAccessibleAbilityIds(EARTH_EQUIPMENT, {}));
        const added = weaponAbilityIds(itemId);
        expect(added.length).toBeGreaterThan(0);
        expect(
            prepLoadoutPrimaryIdsForStoryChoice({
                playerId: 'p1',
                characterId: 'c1',
                equipment: EARTH_EQUIPMENT,
                researchTrees: {},
                equipItem: { itemId },
                missionPrepLoadoutsByPlayer: { p1: selected },
            }),
        ).toEqual([...selected, ...added]);
    });

    it('swaps the old weapon ability for the upgrade in the same slot (Rocks to Charged Rocks)', () => {
        const equipment = [...EARTH_EQUIPMENT, '001'];
        const selected = filterSelectableQuestPrepAbilityIds(buildAccessibleAbilityIds(equipment, {}));
        const rockSlot = selected.indexOf(STARTING_WEAPON_ROCKS_NODE_ID);
        expect(rockSlot).toBeGreaterThanOrEqual(0);
        const next = prepLoadoutPrimaryIdsForStoryChoice({
            playerId: 'p1',
            characterId: 'c1',
            equipment,
            researchTrees: {},
            equipItem: { itemId: '011', replaceItemIds: ['001'] },
            missionPrepLoadoutsByPlayer: { p1: selected },
        })!;
        expect(next).not.toContain(STARTING_WEAPON_ROCKS_NODE_ID);
        expect(next[rockSlot]).toBe('throw_charged_rock');
        expect(next).toHaveLength(selected.length);
    });

    it('seeds the loadout and includes the weapon when nothing is stored yet', () => {
        const next = prepLoadoutAfterStoryChoice({
            selectedPrimaryIds: [],
            equipment: EARTH_EQUIPMENT,
            researchTrees: {},
            equipItem: { itemId: '001' },
        });
        expect(next).toContain(STARTING_WEAPON_ROCKS_NODE_ID);
    });

    it('returns undefined when the choice changes nothing', () => {
        expect(
            prepLoadoutPrimaryIdsForStoryChoice({
                playerId: 'p1',
                characterId: 'c1',
                equipment: EARTH_EQUIPMENT,
                researchTrees: {},
                missionPrepLoadoutsByPlayer: { p1: ['a'] },
            }),
        ).toBeUndefined();
    });

    it('mirrors backend equipItem: removes replaced items and appends once', () => {
        expect(equipmentWithEquippedItem(['019', '001'], '011', ['001'])).toEqual(['019', '011']);
        expect(equipmentWithEquippedItem(['019', '001'], '001')).toEqual(['019', '001']);
    });
});
