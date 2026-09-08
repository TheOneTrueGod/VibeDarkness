import CharactersPanel from '../../games/minion_battles/ui/components/characters/CharactersPanel';
import { playerCharactersPath } from '../ability-tests/campaignTabPaths';
import type { CampaignHomeTabDef, CampaignHomeTabRenderProps } from './campaignHomeTabDef';

export function CampaignHomeCharactersTab({
    api,
    lobbyClient,
    onStartMissionForCharacter,
    onStartQuestForCharacter,
}: CampaignHomeTabRenderProps) {
    return (
        <CharactersPanel
            api={api}
            lobbyClient={lobbyClient}
            onStartMissionForCharacter={onStartMissionForCharacter}
            onStartQuestForCharacter={onStartQuestForCharacter}
        />
    );
}

export const charactersTab: CampaignHomeTabDef = {
    id: 'characters',
    label: 'Characters',
    isVisible: () => true,
    getPath: (userId) => playerCharactersPath(userId),
    render: (props) => <CampaignHomeCharactersTab {...props} />,
};
