import MissionSelectPanel from '../minionBattlesHomePage/MissionSelectPanel';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeMissionSelectTab({
    campaign,
    lobbyClient,
    onSelectMission,
    onCampaignUpdated,
}: CampaignHomeTabRenderProps) {
    return (
        <CampaignHomeTabFrame>
            <MissionSelectPanel
                campaign={campaign}
                lobbyClient={lobbyClient}
                onSelectMission={onSelectMission}
                onCampaignUpdated={onCampaignUpdated}
            />
        </CampaignHomeTabFrame>
    );
}

export const missionSelectTab: CampaignHomeTabDef = {
    id: 'mission_select',
    label: 'Mission Select',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: (props) => <CampaignHomeMissionSelectTab {...props} />,
};
