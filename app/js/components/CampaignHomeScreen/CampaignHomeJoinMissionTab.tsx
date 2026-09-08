import JoinMissionPanel from '../minionBattlesHomePage/JoinMissionPanel';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeJoinMissionTab({
    lobbyClient,
    onJoinLobby,
}: CampaignHomeTabRenderProps) {
    return (
        <CampaignHomeTabFrame>
            <JoinMissionPanel lobbyClient={lobbyClient} onJoinLobby={onJoinLobby} />
        </CampaignHomeTabFrame>
    );
}

export const joinMissionTab: CampaignHomeTabDef = {
    id: 'join_mission',
    label: 'Join Mission',
    isVisible: () => true,
    render: (props) => <CampaignHomeJoinMissionTab {...props} />,
};
