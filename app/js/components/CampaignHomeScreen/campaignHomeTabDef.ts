import type { ReactNode } from 'react';
import type { AccountState, CampaignState } from '../../types';
import type { LobbyClient } from '../../LobbyClient';
import type { MinionBattlesApi } from '../../games/minion_battles/api/minionBattlesApi';
import type { CampaignCharacter } from '../../games/minion_battles/character_defs/CampaignCharacter';
import type { TabId } from '../ability-tests/campaignTabPaths';

/** Shared props passed to every campaign-home tab when it is the active panel. */
export interface CampaignHomeTabRenderProps {
    campaign: CampaignState;
    lobbyClient: LobbyClient;
    api: MinionBattlesApi;
    onSelectMission: (missionId: string, campaignId: string | null) => Promise<boolean>;
    onJoinLobby: (lobbyId: string) => Promise<void>;
    onCampaignUpdated: (updated: CampaignState) => void;
    onStartMissionForCharacter?: (
        missionId: string,
        character: CampaignCharacter,
        ownerAccount: AccountState,
    ) => void;
    onStartQuestForCharacter?: (
        questDefId: string,
        character: CampaignCharacter,
        ownerAccount: AccountState,
        options?: {
            mode?: 'continue' | 'start';
            assignedBankId?: string | null;
            adminSeekSlotIndex?: number;
        },
    ) => void;
}

/** Per-tab chrome + routing. Visibility and label live with the tab file, not the screen. */
export interface CampaignHomeTabDef {
    id: TabId;
    label: string;
    isVisible: (isAdmin: boolean) => boolean;
    adminTab?: boolean;
    /** Override `/campaign/:slug` (players + characters use `/players/*`). */
    getPath?: (userId: number | string) => string;
    render: (props: CampaignHomeTabRenderProps) => ReactNode;
}
