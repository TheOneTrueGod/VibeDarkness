import { useCurrentUser } from '../../user/useCurrentUser';
import AbilityTestPanel from '../minionBattlesHomePage/AbilityTestPanel';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';

export function CampaignHomeAbilityTestTab() {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return <AbilityTestPanel />;
}

export const abilityTestTab: CampaignHomeTabDef = {
    id: 'ability_test',
    label: 'Ability Test',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: () => <CampaignHomeAbilityTestTab />,
};
