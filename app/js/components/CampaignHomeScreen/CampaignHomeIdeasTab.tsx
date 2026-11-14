import { useCurrentUser } from '../../user/useCurrentUser';
import IdeasPanel from '../minionBattlesHomePage/Ideas/IdeasPanel';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeIdeasTab() {
    const { canViewManagerScreens } = useCurrentUser();
    if (!canViewManagerScreens) return null;
    return (
        <CampaignHomeTabFrame>
            <IdeasPanel />
        </CampaignHomeTabFrame>
    );
}

export const ideasTab: CampaignHomeTabDef = {
    id: 'ideas',
    label: 'Ideas',
    access: 'manager',
    render: () => <CampaignHomeIdeasTab />,
};
