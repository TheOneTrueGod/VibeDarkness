import { useCurrentUser } from '../../user/useCurrentUser';
import IdeasPanel from '../minionBattlesHomePage/Ideas/IdeasPanel';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeIdeasTab() {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return (
        <CampaignHomeTabFrame>
            <IdeasPanel />
        </CampaignHomeTabFrame>
    );
}

export const ideasTab: CampaignHomeTabDef = {
    id: 'ideas',
    label: 'Ideas',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: () => <CampaignHomeIdeasTab />,
};
