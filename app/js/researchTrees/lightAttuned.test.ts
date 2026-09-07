import { describe, expect, it } from 'vitest';
import { computePassiveBonuses } from './passiveBonuses';
import { PassiveStatKey } from './types';
import {
    LIGHT_ATTUNED_TIER,
    LIGHT_NODE_CORE,
    LIGHT_NODE_LIGHT_ATTUNED,
    LIGHT_TREE_ID,
    lightTree,
} from './trees/light';
import { LIGHT_REGEN_ENABLED_ADD } from '../games/minion_battles/resources/Light';

describe('Light Attuned research', () => {
    it('is a tier-13 Light Core upgrade that unlocks Light regen', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_LIGHT_ATTUNED);
        expect(node?.tier).toBe(LIGHT_ATTUNED_TIER);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_CORE]);
        expect(node?.passiveBonus?.[PassiveStatKey.LightRegenEnabled]?.add).toBe(LIGHT_REGEN_ENABLED_ADD);
    });

    it('grants LightRegenEnabled when researched', () => {
        const bonuses = computePassiveBonuses({ [LIGHT_TREE_ID]: [LIGHT_NODE_LIGHT_ATTUNED] });
        expect(bonuses[PassiveStatKey.LightRegenEnabled]?.add).toBe(LIGHT_REGEN_ENABLED_ADD);
    });
});
