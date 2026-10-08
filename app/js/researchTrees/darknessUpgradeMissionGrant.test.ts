import { describe, expect, it } from 'vitest';
import { MISSION_MAP } from '../games/minion_battles/storylines';
import { DISPLACER_MISSION_ID } from '../games/minion_battles/storylines/WorldOfDarkness/missions/006d_displacer';
import { DARKNESS_UPGRADES_TREE_ID, grantDarknessUpgradeNode } from './darknessUpgrades';
import { DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS } from './trees/darkness_upgrades';
import { ResearchSource } from './types';

describe('Displacer mission grants Empowered Spirits', () => {
    it('lists Empowered Spirits in its completion rewards', () => {
        expect(MISSION_MAP[DISPLACER_MISSION_ID]?.completionRewards?.darknessUpgradeIds).toEqual([
            DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS,
        ]);
    });

    it('records a mission-granted upgrade with the given source and is idempotent', () => {
        const once = grantDarknessUpgradeNode(undefined, DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS, ResearchSource.QuestReward);
        expect(once.researchTrees[DARKNESS_UPGRADES_TREE_ID]).toContain(DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS);
        expect(once.researchNodeSources[DARKNESS_UPGRADES_TREE_ID]?.[DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS]).toEqual([
            ResearchSource.QuestReward,
        ]);
        expect(grantDarknessUpgradeNode(once, DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS, ResearchSource.QuestReward)).toBe(once);
    });
});
