import CampaignSummaryPanel from '../minionBattlesHomePage/CampaignSummary/CampaignSummaryPanel';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeCampaignSummaryTab({
    campaign,
    lobbyClient,
    onSelectMission,
}: CampaignHomeTabRenderProps) {
    return (
        <CampaignHomeTabFrame>
            <CampaignSummaryPanel
                campaign={campaign}
                lobbyClient={lobbyClient}
                onSelectMission={onSelectMission}
            />
        </CampaignHomeTabFrame>
    );
}

export const campaignSummaryTab: CampaignHomeTabDef = {
    id: 'campaign_summary',
    label: 'Campaign Summary',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: (props) => <CampaignHomeCampaignSummaryTab {...props} />,
};
