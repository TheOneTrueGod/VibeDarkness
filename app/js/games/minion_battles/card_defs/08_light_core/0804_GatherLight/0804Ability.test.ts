import { describe, expect, it } from 'vitest';
// Load AbilityRegistry before ability modules so CastBehaviours finishes exporting
// before ThrowRock's module body calls CastBehaviours.ProjectileLaunch().
import { getAbility } from '../../../abilities/AbilityRegistry';
import {
    GATHER_LIGHT_ABILITY_ID,
    GATHER_LIGHT_AMOUNT,
    GATHER_LIGHT_DARKNESS_PER_LIGHT_GAINED,
    GATHER_LIGHT_DEVOUR_BONUS,
    getGatherLightAmount,
    getGatherLightDarknessAmount,
} from './0804Constants';
import { GatherLightAbility, hasLightImbuementResearch } from './0804Ability';
import {
    GATHER_LIGHT_TILE_COUNT,
    getGatherLightCandidateTiles,
    pickRandomTiles,
} from '../../../abilities/gatherLightHelpers';
import { LIGHT_NODE_IMBUEMENT, LIGHT_TREE_ID } from '../../../../../researchTrees/trees/light';

void getAbility;

describe('Gather Light amount', () => {
    it('starts at 2 Light with no research', () => {
        expect(GATHER_LIGHT_AMOUNT).toBe(2);
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

describe('Gather Light Devour Light', () => {
    it('grants 1 additional light and declares a devourLight keyword use', () => {
        expect(GATHER_LIGHT_DEVOUR_BONUS).toBe(1);
        expect(GatherLightAbility.keywordUses).toEqual([
            expect.objectContaining({ keyword: 'devourLight', n: 1 }),
        ]);
    });

    it('shows the Devour line in the tooltip with imbuement research too', () => {
        const imbued = GatherLightAbility.getTooltipText?.({
            researchTrees: { [LIGHT_TREE_ID]: [LIGHT_NODE_IMBUEMENT] },
        });
        expect(imbued?.[1]).toBe('{Devour Light 1}: gain {1} additional light');
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
        expect(base?.[0]).toMatch(/recover \{2\} light$/);
        expect(base?.[1]).toBe('{Devour Light 1}: gain {1} additional light');

        const imbued = GatherLightAbility.getTooltipText?.({
            researchTrees: { [LIGHT_TREE_ID]: [LIGHT_NODE_IMBUEMENT] },
        });
        expect(imbued?.[0]).toContain('imbue your weapon with light');
    });
});

describe('Gather Light tile selection', () => {
    it('picks distinct tiles from the 5×5 and caps at the tile count', () => {
        const candidates = getGatherLightCandidateTiles(5, 5, 12, 10);
        expect(candidates).toHaveLength(25);
        const rng = { generateRandomInteger: (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1)) };
        const picked = pickRandomTiles(rng, candidates, GATHER_LIGHT_TILE_COUNT);
        expect(picked).toHaveLength(GATHER_LIGHT_TILE_COUNT);
        expect(new Set(picked.map((t) => `${t.col},${t.row}`)).size).toBe(GATHER_LIGHT_TILE_COUNT);
    });

    it('returns fewer tiles when fewer are eligible', () => {
        const rng = { generateRandomInteger: (min: number) => min };
        expect(pickRandomTiles(rng, [{ col: 0, row: 0 }, { col: 1, row: 0 }], 10)).toHaveLength(2);
    });

    it('clamps the candidate area to the grid bounds', () => {
        expect(getGatherLightCandidateTiles(0, 0, 12, 10)).toHaveLength(9);
    });
});
