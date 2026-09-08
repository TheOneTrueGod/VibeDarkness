import { useCurrentUser } from '../../user/useCurrentUser';
import LobbyArchiveTab from '../minionBattlesHomePage/LobbyArchive/LobbyArchiveTab';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeLobbyArchiveTab({
    lobbyClient,
    onJoinLobby,
}: CampaignHomeTabRenderProps) {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return (
        <CampaignHomeTabFrame>
            <LobbyArchiveTab lobbyClient={lobbyClient} onJoinLobby={onJoinLobby} />
        </CampaignHomeTabFrame>
    );
}

export const lobbyArchiveTab: CampaignHomeTabDef = {
    id: 'lobby_archive',
    label: 'Lobby Archive',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: (props) => <CampaignHomeLobbyArchiveTab {...props} />,
};
