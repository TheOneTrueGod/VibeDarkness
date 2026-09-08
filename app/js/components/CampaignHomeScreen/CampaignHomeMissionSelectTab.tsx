import MissionSelectPanel from '../minionBattlesHomePage/MissionSelectPanel';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';

export function CampaignHomeMissionSelectTab({
    campaign,
    lobbyClient,
    onSelectMission,
    onCampaignUpdated,
}: CampaignHomeTabRenderProps) {
    return (
        <MissionSelectPanel
            campaign={campaign}
            lobbyClient={lobbyClient}
            onSelectMission={onSelectMission}
            onCampaignUpdated={onCampaignUpdated}
        />
    );
}

export const missionSelectTab: CampaignHomeTabDef = {
    id: 'mission_select',
    label: 'Mission Select',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: (props) => <CampaignHomeMissionSelectTab {...props} />,
};
