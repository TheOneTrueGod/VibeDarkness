import type { CampaignResourceKey, ResearchTreeDef } from '../types';
import { ZERO_CAMPAIGN_RESOURCES } from '../../campaignResources';
import { PassiveStatKey } from '../types';
import { RESEARCH_TREE_COLOUR_DARKNESS, RESEARCH_TREE_ICON_GENERIC } from '../researchTreeChrome';

export const DARKNESS_UPGRADES_TREE_ID = 'darkness_upgrades';
export const DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS = 'empowered_spirits';

/** Resources granted per victory by Empowered Spirits. */
export const EMPOWERED_SPIRITS_BONUS_PER_RESOURCE = 2;

/**
 * Resources Empowered Spirits grants: food, metal and crystals. `exhaustion` is a penalty accumulator and
 * `population` is intentionally not granted as a mission bonus.
 */
export const DARKNESS_UPGRADE_REWARD_RESOURCE_KEYS: CampaignResourceKey[] = (
    Object.keys(ZERO_CAMPAIGN_RESOURCES) as CampaignResourceKey[]
).filter((key) => key !== 'exhaustion' && key !== 'population');

function bonusPerResource(amount: number): Partial<Record<CampaignResourceKey, number>> {
    const out: Partial<Record<CampaignResourceKey, number>> = {};
    for (const key of DARKNESS_UPGRADE_REWARD_RESOURCE_KEYS) out[key] = amount;
    return out;
}

/**
 * Admin-granted, per-player global upgrades. Owned state lives on `CampaignState.darknessUpgrades`,
 * never on a character. The only node is `disabled` (admin-only) and the tree is accessible only
 * once a node is owned.
 */
export const darknessUpgradesTree: ResearchTreeDef = {
    id: DARKNESS_UPGRADES_TREE_ID,
    title: 'Darkness Upgrades',
    colour: RESEARCH_TREE_COLOUR_DARKNESS,
    icon: RESEARCH_TREE_ICON_GENERIC,
    accessRequirements: [
        {
            type: 'anyResearched',
            treeId: DARKNESS_UPGRADES_TREE_ID,
            nodeIds: [DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS],
        },
    ],
    nodes: [
        {
            id: DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS,
            title: 'Empowered Spirits',
            description:
                'Slimes gain +12 max health and fire 2 additional projectiles in a wedge. Victorious missions grant +2 food, metal and crystals.',
            summary: 'Tougher Ghosts',
            flavorText: 'The darkness feeds, and what it feeds grows.',
            order: 10,
            tier: 1,
            disabled: true,
            position: { x: 340, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            passiveBonus: {
                [PassiveStatKey.EnemyUnitSlimeMaxHealthBonus]: { add: 12 },
                [PassiveStatKey.EnemyUnitSlimeExtraProjectiles]: { add: 2 },
            },
            bonusRewards: bonusPerResource(EMPOWERED_SPIRITS_BONUS_PER_RESOURCE),
        },
    ],
};
