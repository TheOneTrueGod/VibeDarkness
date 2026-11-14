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

/**
 * Who sees a tab. `everyone`; `manager` = managers and admins (light-red tab); `admin` = admins only (dark-red tab).
 */
export type CampaignHomeTabAccess = 'everyone' | 'manager' | 'admin';

/** The viewer flags tab access reads (from `useCurrentUser()`). */
export interface CampaignHomeTabViewer {
    isAdmin: boolean;
    canViewManagerScreens: boolean;
}

export function canViewCampaignHomeTab(access: CampaignHomeTabAccess, viewer: CampaignHomeTabViewer): boolean {
    switch (access) {
        case 'everyone':
            return true;
        case 'manager':
            return viewer.canViewManagerScreens;
        case 'admin':
            return viewer.isAdmin;
    }
}

/** Tab-bar tint per access level; `manager` is a lighter red than `admin`. */
export const CAMPAIGN_HOME_TAB_ACCESS_CLASS: Record<CampaignHomeTabAccess, string> = {
    everyone: '',
    manager: 'bg-red-800/40 hover:bg-red-800/60',
    admin: 'bg-red-950/50 hover:bg-red-950/70',
};

/** Per-tab chrome + routing. Access and label live with the tab file, not the screen. */
export interface CampaignHomeTabDef {
    id: TabId;
    label: string;
    access: CampaignHomeTabAccess;
    /** Override `/campaign/:slug` (players + characters use `/players/*`). */
    getPath?: (userId: number | string) => string;
    render: (props: CampaignHomeTabRenderProps) => ReactNode;
}
