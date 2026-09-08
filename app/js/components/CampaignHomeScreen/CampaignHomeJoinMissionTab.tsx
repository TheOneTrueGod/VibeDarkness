import JoinMissionPanel from '../minionBattlesHomePage/JoinMissionPanel';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';

export function CampaignHomeJoinMissionTab({
    lobbyClient,
    onJoinLobby,
}: CampaignHomeTabRenderProps) {
    return <JoinMissionPanel lobbyClient={lobbyClient} onJoinLobby={onJoinLobby} />;
}

export const joinMissionTab: CampaignHomeTabDef = {
    id: 'join_mission',
    label: 'Join Mission',
    isVisible: () => true,
    render: (props) => <CampaignHomeJoinMissionTab {...props} />,
};
