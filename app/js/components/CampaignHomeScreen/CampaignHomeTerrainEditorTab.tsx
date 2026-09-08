import { useCurrentUser } from '../../user/useCurrentUser';
import TerrainEditorTab from '../minionBattlesHomePage/TerrainEditor/TerrainEditorTab';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';

export function CampaignHomeTerrainEditorTab() {
    const { isAdmin } = useCurrentUser();
    if (!isAdmin) return null;
    return <TerrainEditorTab />;
}

export const terrainEditorTab: CampaignHomeTabDef = {
    id: 'terrain_editor',
    label: 'Terrain Editor',
    isVisible: (isAdmin) => isAdmin,
    adminTab: true,
    render: () => <CampaignHomeTerrainEditorTab />,
};
