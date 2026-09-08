import { useCurrentUser } from '../../user/useCurrentUser';
import BestiaryPanel from '../minionBattlesHomePage/BestiaryPanel';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeBestiaryTab() {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return (
        <CampaignHomeTabFrame>
            <BestiaryPanel />
        </CampaignHomeTabFrame>
    );
}

export const bestiaryTab: CampaignHomeTabDef = {
    id: 'bestiary',
    label: 'Bestiary',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: () => <CampaignHomeBestiaryTab />,
};
