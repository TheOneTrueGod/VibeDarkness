import { useCurrentUser } from '../../user/useCurrentUser';
import AdminPlayersHomePanel from '../minionBattlesHomePage/AdminPlayersHomePanel';
import { playersListPath } from '../ability-tests/campaignTabPaths';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';

export function CampaignHomePlayersTab({ lobbyClient }: CampaignHomeTabRenderProps) {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return <AdminPlayersHomePanel lobbyClient={lobbyClient} />;
}

export const playersTab: CampaignHomeTabDef = {
    id: 'players',
    label: 'Players',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    getPath: () => playersListPath(),
    render: (props) => <CampaignHomePlayersTab {...props} />,
};
