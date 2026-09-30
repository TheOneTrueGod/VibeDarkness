import { describe, expect, it } from 'vitest';
// Load AbilityRegistry before ability modules so CastBehaviours finishes exporting
// before ThrowRock's module body calls CastBehaviours.ProjectileLaunch().
import { getAbility } from '../../../abilities/AbilityRegistry';
import {
    GATHER_LIGHT_ABILITY_ID,
    GATHER_LIGHT_AMOUNT,
    GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED,
    getGatherLightAmount,
    getGatherLightDarknessAmount,
} from './0804Constants';
import { GatherLightAbility, hasLightImbuementResearch } from './0804Ability';
import { LIGHT_NODE_IMBUEMENT, LIGHT_TREE_ID } from '../../../../../researchTrees/trees/light';

void getAbility;

describe('Gather Light amount', () => {
    it('starts at 1 Light with no research', () => {
        expect(GATHER_LIGHT_AMOUNT).toBe(1);
        expect(getGatherLightAmount()).toBe(GATHER_LIGHT_AMOUNT);
    });

    it('adds resourceGainFlat from ability modifiers', () => {
        expect(
            getGatherLightAmount({
                abilityModifiers: { [GATHER_LIGHT_ABILITY_ID]: { resourceGainFlat: 2 } },
            }),
        ).toBe(GATHER_LIGHT_AMOUNT + 2);
    });
});

describe('Gather Light darkness', () => {
    it('is half a darkness step per Light gained', () => {
        expect(getGatherLightDarknessAmount(GATHER_LIGHT_AMOUNT)).toBe(
            -GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED * GATHER_LIGHT_AMOUNT,
        );
    });

    it('scales with extra Light from research modifiers', () => {
        const lightGained = getGatherLightAmount({
            abilityModifiers: { [GATHER_LIGHT_ABILITY_ID]: { resourceGainFlat: 2 } },
        });
        expect(getGatherLightDarknessAmount(lightGained)).toBe(
            -GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED * lightGained,
        );
    });
});

describe('Gather Light Light Imbuement gating', () => {
    it('detects Light Imbuement from a researchTrees tooltip bag', () => {
        expect(hasLightImbuementResearch({
            researchTrees: { [LIGHT_TREE_ID]: [LIGHT_NODE_IMBUEMENT] },
        })).toBe(true);
        expect(hasLightImbuementResearch({ researchTrees: { [LIGHT_TREE_ID]: [] } })).toBe(false);
    });

    it('mentions weapon imbuement in the tooltip only with Light Imbuement researched', () => {
        const base = GatherLightAbility.getTooltipText?.({});
        expect(base?.[0]).toMatch(/recover \{1\} light$/);

        const imbued = GatherLightAbility.getTooltipText?.({
            researchTrees: { [LIGHT_TREE_ID]: [LIGHT_NODE_IMBUEMENT] },
        });
        expect(imbued?.[0]).toContain('imbue your weapon with light');
    });
});
