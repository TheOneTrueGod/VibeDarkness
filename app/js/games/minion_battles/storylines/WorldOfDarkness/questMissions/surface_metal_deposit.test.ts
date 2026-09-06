import { describe, expect, it } from 'vitest';
import { EARTH_NODE_EARTH_CORE, EARTH_TREE_ID } from '../../../../../researchTrees/trees/earth';
import { coreEarthItem } from '../../../character_defs/items/core/019_core_earth';
import {
    SEARCH_FOR_LOOSE_METALS_LABEL,
    SEARCH_FOR_LOOSE_METALS_OPTION_ID,
    REQUIRES_EARTH_CORE_LABEL,
    SURFACE_METAL_HARVEST_METAL,
    requiresItemLabel,
} from './questMissionConstants';
import {
    SURFACE_METAL_CHOICE_ID,
    SURFACE_METAL_DEPOSIT,
    SURFACE_METAL_OPTION_EXTRACT,
    SURFACE_METAL_OPTION_HARVEST,
} from './surface_metal_deposit';

const baseParams = {
    choiceId: SURFACE_METAL_CHOICE_ID,
    equippedItemIds: [] as string[],
    playerResearchTrees: {} as Record<string, string[]>,
};

describe('Surface metal deposit choices', () => {
    it('uses Requires <item name> for the Earth Core gate', () => {
        expect(requiresItemLabel(coreEarthItem.name)).toBe(REQUIRES_EARTH_CORE_LABEL);
        expect(REQUIRES_EARTH_CORE_LABEL).toBe(`Requires ${coreEarthItem.name}`);
    });

    it('renames the harvest pick to Search for loose metals', () => {
        const options = SURFACE_METAL_DEPOSIT.getPostMissionChoiceOptions(baseParams);
        expect(options).not.toBeNull();
        const harvest = options!.find((o) => o.id === SURFACE_METAL_OPTION_HARVEST);
        expect(SURFACE_METAL_OPTION_HARVEST).toBe(SEARCH_FOR_LOOSE_METALS_OPTION_ID);
        expect(harvest?.label).toBe(SEARCH_FOR_LOOSE_METALS_LABEL);
        expect(harvest?.loreTitle).toBe(SEARCH_FOR_LOOSE_METALS_LABEL);
        expect(harvest?.action).toEqual({
            type: 'grant_resources',
            metal: SURFACE_METAL_HARVEST_METAL,
        });
    });

    it('disables Extract Metal with a Requires Earth Core reason when the item is missing', () => {
        const options = SURFACE_METAL_DEPOSIT.getPostMissionChoiceOptions(baseParams);
        const extract = options!.find((o) => o.id === SURFACE_METAL_OPTION_EXTRACT);
        expect(extract?.disabledLabel).toBe(REQUIRES_EARTH_CORE_LABEL);
        expect(options!.map((o) => o.id)).toEqual([
            SURFACE_METAL_OPTION_HARVEST,
            SURFACE_METAL_OPTION_EXTRACT,
        ]);
    });

    it('enables Extract Metal when Earth Core is researched', () => {
        const options = SURFACE_METAL_DEPOSIT.getPostMissionChoiceOptions({
            ...baseParams,
            playerResearchTrees: { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE] },
        });
        const extract = options!.find((o) => o.id === SURFACE_METAL_OPTION_EXTRACT);
        expect(extract?.disabledLabel).toBeUndefined();
    });
});
