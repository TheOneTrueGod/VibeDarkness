import { useCurrentUser } from '../../user/useCurrentUser';
import TerrainEditorTab from '../minionBattlesHomePage/TerrainEditor/TerrainEditorTab';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeTerrainEditorTab() {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return (
        <CampaignHomeTabFrame>
            <TerrainEditorTab />
        </CampaignHomeTabFrame>
    );
}

export const terrainEditorTab: CampaignHomeTabDef = {
    id: 'terrain_editor',
    label: 'Terrain Editor',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: () => <CampaignHomeTerrainEditorTab />,
};
