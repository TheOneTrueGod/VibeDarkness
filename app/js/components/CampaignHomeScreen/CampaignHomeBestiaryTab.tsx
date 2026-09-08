import { useCurrentUser } from '../../user/useCurrentUser';
import BestiaryPanel from '../minionBattlesHomePage/BestiaryPanel';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';

export function CampaignHomeBestiaryTab() {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return <BestiaryPanel />;
}

export const bestiaryTab: CampaignHomeTabDef = {
    id: 'bestiary',
    label: 'Bestiary',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: () => <CampaignHomeBestiaryTab />,
};
