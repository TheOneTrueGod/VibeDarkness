import { describe, expect, it } from 'vitest';
import type { QuestRunState } from '../../storylines/questTypes';
import {
    buildEquipmentUpdate,
    canItemFillSlot,
    filterEquipmentMenuItemIds,
    filterItemIdsByFilters,
    filterItemIdsByName,
    getEquipmentFilters,
    getSlotDescriptors,
    getVisibleSlotDescriptors,
    isEquipmentLockedByQuest,
    itemMatchesFilter,
    WEAPON_FIRST_SLOT_ORDER,
} from './equipmentSlots';
import { coreEarthItem } from './core/019_core_earth';
import { coreWeaponsItem } from './core/006_core_weapons';
import { swordItem } from './weapons/013_sword';
import { maceItem } from './weapons/014_mace';
import { throwTorchUtilityItem } from './utility/005_throw_torch';
import { pistolItem } from './weapons/007_pistol';
import { ALL_PLAYER_ITEMS, getItemDef } from './index';
import {
    KNOWLEDGE_EQUIPMENT_SLOT_CUSTOMIZATION_CORE,
    KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1,
} from '../../../../accountKnowledge';

describe('getSlotDescriptors', () => {
    it('lists core first by default (Character Editor)', () => {
        expect(getSlotDescriptors([coreEarthItem.id, swordItem.id])).toEqual([
            { type: 'core', label: 'core' },
            { type: 'weapon', index: 0, label: 'weapon' },
            { type: 'utility', index: 0, label: 'utility' },
        ]);
    });

    it('lists weapons, then core, then utility for the Prepare order', () => {
        expect(getSlotDescriptors([coreEarthItem.id], WEAPON_FIRST_SLOT_ORDER).map((d) => d.type)).toEqual([
            'weapon',
            'core',
            'utility',
        ]);
    });

    it('numbers repeated slot types from the core layout', () => {
        const labels = getSlotDescriptors([coreWeaponsItem.id], WEAPON_FIRST_SLOT_ORDER).map((d) => d.label);
        expect(labels).toEqual(['weapon 1', 'weapon 2', 'weapon 3', 'core']);
    });
});

describe('canItemFillSlot', () => {
    it('matches the item def slot types', () => {
        expect(canItemFillSlot(swordItem.id, 'weapon')).toBe(true);
        expect(canItemFillSlot(swordItem.id, 'core')).toBe(false);
        expect(canItemFillSlot(throwTorchUtilityItem.id, 'utility')).toBe(true);
        expect(canItemFillSlot('no-such-item', 'weapon')).toBe(false);
    });
});

describe('filterItemIdsByName', () => {
    const ids = [swordItem.id, maceItem.id, coreEarthItem.id];

    it('returns every id for an empty query', () => {
        expect(filterItemIdsByName(ids, '  ')).toEqual(ids);
    });

    it('matches names case-insensitively', () => {
        expect(filterItemIdsByName(ids, swordItem.name.toUpperCase())).toEqual([swordItem.id]);
    });
});

describe('quest equipment rules', () => {
    const run = { questCharacter: { equipment: ['old'] } } as unknown as QuestRunState;

    it('locks equipment for non-admins during a quest run', () => {
        expect(isEquipmentLockedByQuest({ activeQuestRun: run }, false)).toBe(true);
        expect(isEquipmentLockedByQuest({ activeQuestRun: run }, true)).toBe(false);
        expect(isEquipmentLockedByQuest({ activeQuestRun: null }, false)).toBe(false);
    });

    it('writes equipment to the quest snapshot during a run', () => {
        expect(buildEquipmentUpdate(null, ['a'])).toEqual({ equipment: ['a'] });
        const update = buildEquipmentUpdate(run, ['a']);
        expect(update.equipment).toEqual(['a']);
        expect(update.activeQuestRun?.questCharacter.equipment).toEqual(['a']);
    });
});

describe('equipment filters', () => {
    it('sorts weapons into melee and ranged, and cores under core', () => {
        expect(itemMatchesFilter(swordItem.id, 'melee')).toBe(true);
        expect(itemMatchesFilter(swordItem.id, 'ranged')).toBe(false);
        expect(itemMatchesFilter(pistolItem.id, 'ranged')).toBe(true);
        expect(itemMatchesFilter(coreEarthItem.id, 'core')).toBe(true);
        expect(itemMatchesFilter(coreEarthItem.id, 'melee')).toBe(false);
        expect(itemMatchesFilter(throwTorchUtilityItem.id, 'utility')).toBe(true);
        expect(itemMatchesFilter(swordItem.id, 'utility')).toBe(false);
    });

    it('ORs active filters and keeps everything when none are active', () => {
        const ids = [swordItem.id, pistolItem.id, coreEarthItem.id];
        expect(filterItemIdsByFilters(ids, new Set())).toEqual(ids);
        expect(filterItemIdsByFilters(ids, new Set(['melee', 'core'] as const))).toEqual([
            swordItem.id,
            coreEarthItem.id,
        ]);
    });

    it('gives every weapon item an attack range', () => {
        const weapons = ALL_PLAYER_ITEMS.filter((id) => getItemDef(id)?.slots.includes('weapon'));
        expect(weapons.length).toBeGreaterThan(0);
        for (const id of weapons) {
            expect(getItemDef(id)?.attackRange, id).toBeDefined();
        }
    });
});

describe('slot knowledge', () => {
    const visible = (equipment: string[], knowledge: Record<string, unknown> | undefined) =>
        getVisibleSlotDescriptors(equipment, knowledge, WEAPON_FIRST_SLOT_ORDER).map(
            (d) => `${d.label}${d.locked ? ' (locked)' : ''}`,
        );

    it('hides Utility 1 until the player has its knowledge', () => {
        const all = { [KNOWLEDGE_EQUIPMENT_SLOT_CUSTOMIZATION_CORE]: {} };
        expect(visible([coreEarthItem.id], all)).toEqual(['weapon', 'core']);
        expect(visible([coreEarthItem.id], { ...all, [KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1]: {} })).toEqual([
            'weapon',
            'core',
            'utility',
        ]);
    });

    it('shows the core slot locked until the player has core customization knowledge', () => {
        expect(visible([coreEarthItem.id], undefined)).toEqual(['weapon', 'core (locked)']);
        expect(visible([coreEarthItem.id], { [KNOWLEDGE_EQUIPMENT_SLOT_CUSTOMIZATION_CORE]: {} })).toEqual([
            'weapon',
            'core',
        ]);
    });

    it('leaves weapon slots ungated', () => {
        expect(visible([coreWeaponsItem.id], {})).toEqual(['weapon 1', 'weapon 2', 'weapon 3', 'core (locked)']);
    });

    it('drops core items and the Core filter from menus without core customization', () => {
        const ids = [swordItem.id, coreEarthItem.id, throwTorchUtilityItem.id];
        expect(filterEquipmentMenuItemIds(ids, {})).toEqual([swordItem.id, throwTorchUtilityItem.id]);
        expect(getEquipmentFilters({}).map((f) => f.id)).toEqual(['melee', 'ranged', 'utility']);

        const known = { [KNOWLEDGE_EQUIPMENT_SLOT_CUSTOMIZATION_CORE]: {} };
        expect(filterEquipmentMenuItemIds(ids, known)).toEqual(ids);
        expect(getEquipmentFilters(known).map((f) => f.id)).toEqual(['melee', 'ranged', 'utility', 'core']);
    });
});
