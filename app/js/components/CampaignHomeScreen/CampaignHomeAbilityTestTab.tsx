import { useCurrentUser } from '../../user/useCurrentUser';
import AbilityTestPanel from '../minionBattlesHomePage/AbilityTestPanel';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeAbilityTestTab() {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return (
        <CampaignHomeTabFrame>
            <AbilityTestPanel />
        </CampaignHomeTabFrame>
    );
}

export const abilityTestTab: CampaignHomeTabDef = {
    id: 'ability_test',
    label: 'Ability Test',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: () => <CampaignHomeAbilityTestTab />,
};
