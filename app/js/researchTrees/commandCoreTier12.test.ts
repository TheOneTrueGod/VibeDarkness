/**
 * Command Core tier 12: Storm Surge (Spirit Storm), Frenzied Flurry (Sic 'em's flurry) and Thorn Volley
 * (Fling Thorns), as research modifiers on the abilities they upgrade.
 */
import { describe, expect, it } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import {
    COMMAND_CORE_NODE_FRENZIED_FLURRY,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
    COMMAND_CORE_NODE_MIMIC_BRAMBLES,
    COMMAND_CORE_NODE_MIMIC_THORN,
    COMMAND_CORE_NODE_OVERGROWTH,
    COMMAND_CORE_NODE_SPIRIT_STORM,
    COMMAND_CORE_NODE_STORM_SURGE,
    COMMAND_CORE_NODE_THORN_VOLLEY,
    COMMAND_CORE_TREE_ID,
    commandCoreTree,
} from './trees/command_core';

const node = (id: string) => commandCoreTree.nodes.find((n) => n.id === id)!;

describe('command core tier 12', () => {
    it('adds three tier 12 nodes, each after the node that grants its ability', () => {
        expect(node(COMMAND_CORE_NODE_STORM_SURGE)).toMatchObject({ tier: 12, prereqNodeIds: [COMMAND_CORE_NODE_SPIRIT_STORM] });
        expect(node(COMMAND_CORE_NODE_FRENZIED_FLURRY)).toMatchObject({ tier: 12, prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] });
        expect(node(COMMAND_CORE_NODE_THORN_VOLLEY)).toMatchObject({ tier: 12, prereqNodeIds: [COMMAND_CORE_NODE_MIMIC_THORN] });
    });

    it('Storm Surge: Spirit Storm +2 damage per hit and +30% area', () => {
        const mods = computeAbilityModifiersFromResearch({ [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_STORM_SURGE] });
        expect(mods['0713']?.damageFlat).toBe(2);
        expect(mods['0713']?.areaMult).toBeCloseTo(1.3);
    });

    it("Frenzied Flurry: Sic 'em's Spirit Flurry +2 hits", () => {
        const mods = computeAbilityModifiersFromResearch({ [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_FRENZIED_FLURRY] });
        expect(mods['0711']?.repeatCountFlat).toBe(2);
    });

    it('Thorn Volley: Fling Thorns +3 thorns', () => {
        const mods = computeAbilityModifiersFromResearch({ [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_THORN_VOLLEY] });
        expect(mods['0705']?.repeatCountFlat).toBe(3);
    });

    it('Overgrowth: Bramble Patch +1 tile on each side (3x3 to 5x5)', () => {
        expect(node(COMMAND_CORE_NODE_OVERGROWTH)).toMatchObject({ tier: 12, prereqNodeIds: [COMMAND_CORE_NODE_MIMIC_BRAMBLES] });
        const mods = computeAbilityModifiersFromResearch({ [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_OVERGROWTH] });
        expect(mods['0706']?.tileAreaRadiusFlat).toBe(1);
    });
});
