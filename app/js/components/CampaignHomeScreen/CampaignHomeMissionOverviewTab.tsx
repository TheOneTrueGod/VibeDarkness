import { useCurrentUser } from '../../user/useCurrentUser';
import MissionOverviewPanel from '../minionBattlesHomePage/MissionOverview/MissionOverviewPanel';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeMissionOverviewTab() {
    const { canViewManagerScreens } = useCurrentUser();
    if (!canViewManagerScreens) return null;
    return (
        <CampaignHomeTabFrame>
            <MissionOverviewPanel />
        </CampaignHomeTabFrame>
    );
}

export const missionOverviewTab: CampaignHomeTabDef = {
    id: 'mission_overview',
    label: 'Mission Overview',
    access: 'manager',
    render: () => <CampaignHomeMissionOverviewTab />,
};
