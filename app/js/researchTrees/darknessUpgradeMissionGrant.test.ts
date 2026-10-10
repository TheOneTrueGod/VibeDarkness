import { describe, expect, it } from 'vitest';
import { MISSION_MAP } from '../games/minion_battles/storylines';
import { DISPLACER_MISSION_ID } from '../games/minion_battles/storylines/WorldOfDarkness/missions/006d_displacer';
import {
    DARKNESS_UPGRADES_TREE_ID,
    computeDarknessUpgradeBonuses,
    filterDarknessUpgradesByCompletedMissions,
    getCompletedMissionIds,
    grantDarknessUpgradeNode,
    revokeDarknessUpgradeNode,
} from './darknessUpgrades';
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

describe('Darkness upgrades are tied to the mission they came from', () => {
    const owned = grantDarknessUpgradeNode(
        undefined,
        DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS,
        ResearchSource.QuestReward,
        DISPLACER_MISSION_ID,
    );

    it('records the source mission and keeps it on re-grant', () => {
        expect(owned.sourceMissions).toEqual({ [DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS]: DISPLACER_MISSION_ID });
        const again = grantDarknessUpgradeNode(owned, DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS, ResearchSource.Admin, 'other');
        expect(again.sourceMissions?.[DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS]).toBe(DISPLACER_MISSION_ID);
    });

    it('is disabled for a character that has not completed the source mission', () => {
        const filtered = filterDarknessUpgradesByCompletedMissions(owned, new Set());
        expect(filtered?.researchTrees[DARKNESS_UPGRADES_TREE_ID]).toEqual([]);
        expect(computeDarknessUpgradeBonuses(filtered)).toEqual({});
    });

    it('is enabled once the character has won the source mission', () => {
        const completed = getCompletedMissionIds({
            world_of_darkness: [{ missionId: DISPLACER_MISSION_ID, result: 'victory' }],
        });
        const filtered = filterDarknessUpgradesByCompletedMissions(owned, completed);
        expect(computeDarknessUpgradeBonuses(filtered).enemy_unit_slime_max_health_bonus?.add).toBe(12);
    });

    it('does not count a defeat, and admin grants without a source are always enabled', () => {
        expect(getCompletedMissionIds({ w: [{ missionId: DISPLACER_MISSION_ID, result: 'defeat' }] }).size).toBe(0);
        const adminOnly = grantDarknessUpgradeNode(undefined, DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS);
        expect(filterDarknessUpgradesByCompletedMissions(adminOnly, new Set())).toBe(adminOnly);
    });

    it('revoking drops the source mission', () => {
        const revoked = revokeDarknessUpgradeNode(owned, DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS);
        expect(revoked.sourceMissions).toBeUndefined();
    });
});
