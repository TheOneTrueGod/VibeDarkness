import { CAMPAIGN_TAB_IDS, type TabId } from '../ability-tests/campaignTabPaths';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { welcomeTab } from './CampaignHomeWelcomeTab';
import { missionSelectTab } from './CampaignHomeMissionSelectTab';
import { joinMissionTab } from './CampaignHomeJoinMissionTab';
import { playersTab } from './CampaignHomePlayersTab';
import { charactersTab } from './CampaignHomeCharactersTab';
import { abilityTestTab } from './CampaignHomeAbilityTestTab';
import { terrainEditorTab } from './CampaignHomeTerrainEditorTab';
import { lobbyArchiveTab } from './CampaignHomeLobbyArchiveTab';
import { bestiaryTab } from './CampaignHomeBestiaryTab';

const TAB_DEFS: Record<TabId, CampaignHomeTabDef> = {
    welcome: welcomeTab,
    mission_select: missionSelectTab,
    join_mission: joinMissionTab,
    players: playersTab,
    characters: charactersTab,
    ability_test: abilityTestTab,
    terrain_editor: terrainEditorTab,
    lobby_archive: lobbyArchiveTab,
    bestiary: bestiaryTab,
};

/** Tab bar order follows `CAMPAIGN_TAB_IDS`. */
export const CAMPAIGN_HOME_TABS: CampaignHomeTabDef[] = CAMPAIGN_TAB_IDS.map((id) => TAB_DEFS[id]);

export function getCampaignHomeTab(id: TabId): CampaignHomeTabDef {
    return TAB_DEFS[id];
}
