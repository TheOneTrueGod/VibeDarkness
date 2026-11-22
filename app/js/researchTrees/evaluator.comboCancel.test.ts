import { describe, it, expect } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import { mergeAbilityModifierInto } from './abilityModifierMerge';
import type { AbilityModifier } from './types';
import { expandAbilityIdsForResearchModifiers } from '../games/minion_battles/abilities/abilityModifierHelpers';
import {
    EARTH_NODE_RAPID_THROW,
    EARTH_TREE_ID,
} from './trees/earth';
import { KNOWLEDGE_COMBOS } from '../accountKnowledge';
import { meetsRequirement, type ResearchContext } from './evaluator';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import { weaponsTree } from './trees/weapons';
import { NODE_KNIFE_COMBO, NODE_MORE_ROCK, WEAPONS_TREE_ID } from './trees/weaponTreeIds';
import { isVirtualRootNode } from './types';
import type { AccountState, CampaignResources } from '../types';

const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';

function rockThrowTags(abilityId: string): readonly string[] {
    return abilityId === THROW_ROCK_ABILITY_ID || abilityId === THROW_CHARGED_ROCK_ABILITY_ID
        ? ['RockThrow']
        : [];
}

describe('computeAbilityModifiersFromResearch — Combo Cancel', () => {
    it('Rapid Throw level 1 yields comboMax 2 on RockThrow abilities (one combo window)', () => {
        const researchTrees = {
            [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW],
        };
        const researchNodeLevels = {
            [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 1 },
        };
        const modifiers = computeAbilityModifiersFromResearch(
            researchTrees,
            rockThrowTags,
            [THROW_ROCK_ABILITY_ID, THROW_CHARGED_ROCK_ABILITY_ID],
            researchNodeLevels,
        );
        expect(modifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(2);
        expect(modifiers[THROW_CHARGED_ROCK_ABILITY_ID]?.comboMax).toBe(2);
    });

    it('Rapid Throw level 2 yields comboMax 3 on throw_rock via RockThrow tag', () => {
        const researchTrees = {
            [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW],
        };
        const researchNodeLevels = {
            [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 2 },
        };
        const modifiers = computeAbilityModifiersFromResearch(
            researchTrees,
            rockThrowTags,
            [THROW_ROCK_ABILITY_ID, THROW_CHARGED_ROCK_ABILITY_ID],
            researchNodeLevels,
        );
        expect(modifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(3);
        expect(modifiers[THROW_CHARGED_ROCK_ABILITY_ID]?.comboMax).toBe(3);
    });

    it('applies Rapid Throw comboMax to throw_rock when only throw_charged_rock is on the bar', () => {
        const researchTrees = {
            [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW],
        };
        const researchNodeLevels = {
            [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 2 },
        };
        const modifiers = computeAbilityModifiersFromResearch(
            researchTrees,
            rockThrowTags,
            expandAbilityIdsForResearchModifiers([THROW_CHARGED_ROCK_ABILITY_ID]),
            researchNodeLevels,
        );
        expect(modifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(3);
        expect(modifiers[THROW_CHARGED_ROCK_ABILITY_ID]?.comboMax).toBe(3);
    });

    it('merges comboUnlimited (OR) with a bounded comboMax', () => {
        const entry: AbilityModifier = { comboMax: 2 };
        mergeAbilityModifierInto(entry, { comboUnlimited: true });
        expect(entry).toEqual({ comboMax: 2, comboUnlimited: true });
    });
});

describe('Flurry (knife combo research node)', () => {
    const THROW_KNIFE_ABILITY_ID = 'throw_knife';

    function ctxWithKnowledge(knowledge: Record<string, object>): ResearchContext {
        return {
            account: { id: 1, name: 't', role: 'user', fire: 0, water: 0, earth: 0, air: 0, knowledge } as AccountState,
            character: fromCampaignCharacterData({
                id: 'c1',
                name: 'C',
                equipment: [],
                knowledge: {},
                traits: [],
                portraitId: '',
                battleChipDetails: {},
                campaignId: 'world_of_darkness',
                missionId: '',
                researchTrees: {},
            }),
            campaignResources: { vigor: 100, metal: 100, population: 10, attunement: 100 } as CampaignResources,
        };
    }

    it("Flurry grants unlimited Combo to every weapon's basic ability (each virtual root)", () => {
        const rootAbilityIds = weaponsTree.nodes.filter(isVirtualRootNode).map((n) => n.modifiesAbility!.to);
        expect(rootAbilityIds).toEqual(expect.arrayContaining([THROW_KNIFE_ABILITY_ID, THROW_ROCK_ABILITY_ID, '0103']));
        const modifiers = computeAbilityModifiersFromResearch({ [WEAPONS_TREE_ID]: [NODE_KNIFE_COMBO] });
        for (const abilityId of rootAbilityIds) {
            expect(modifiers[abilityId]?.comboUnlimited, abilityId).toBe(true);
        }
    });

    it('Flurry stops at the basic abilities: higher-tier weapon nodes do not add their abilities', () => {
        const higherTier = weaponsTree.nodes.filter((n) => (n.tier ?? 0) > 1 && n.modifiesAbility);
        const rootAbilityIds = new Set(weaponsTree.nodes.filter(isVirtualRootNode).map((n) => n.modifiesAbility!.to));
        const modifiers = computeAbilityModifiersFromResearch({ [WEAPONS_TREE_ID]: [NODE_KNIFE_COMBO] });
        for (const node of higherTier) {
            const id = node.modifiesAbility!.to;
            if (rootAbilityIds.has(id)) continue;
            expect(modifiers[id]?.comboUnlimited, `${node.id} -> ${id}`).toBeUndefined();
        }
        expect(weaponsTree.nodes.find((n) => n.id === NODE_MORE_ROCK)!.tier).toBeGreaterThan(1);
    });

    it('requires only Knowledge: Combos (no weapon root)', () => {
        const node = weaponsTree.nodes.find((n) => n.id === NODE_KNIFE_COMBO)!;
        expect(node.prereqNodeIds).toEqual([]);
        const researched = {};
        const without = ctxWithKnowledge({});
        const withKnowledge = ctxWithKnowledge({ [KNOWLEDGE_COMBOS]: {} });
        expect(node.requirements.every((r) => meetsRequirement(r, without, researched))).toBe(false);
        expect(node.requirements.every((r) => meetsRequirement(r, withKnowledge, researched))).toBe(true);
    });
});
