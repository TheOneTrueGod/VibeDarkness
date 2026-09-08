import type { ComponentProps, ReactNode } from 'react';
import type { CharacterInnerTabId } from '../../ability-tests/campaignTabPaths';
import Equipment from './Equipment/Equipment';
import MissionMap from './MissionMap/MissionMap';
import StatBonuses from './StatBonuses/StatBonuses';
import Upgrades from './Upgrades/Upgrades';

interface CharactersTabLayerTwoProps {
    tab: CharacterInnerTabId;
    map: ComponentProps<typeof MissionMap>;
    bonuses: ComponentProps<typeof StatBonuses>;
    upgrades: ReactNode;
    equipment?: ReactNode;
}

/** Right-hand character sheet: dispatches to the folder component for the routed tab. */
export function CharactersTabLayerTwo({
    tab,
    map,
    bonuses,
    upgrades,
    equipment,
}: CharactersTabLayerTwoProps) {
    switch (tab) {
        case 'map':
            return (
                <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col">
                    <div className="flex-1 min-h-0">
                        <MissionMap {...map} />
                    </div>
                </div>
            );
        case 'upgrades':
            return <Upgrades>{upgrades}</Upgrades>;
        case 'bonuses':
            return (
                <div className="flex-1 min-h-0 overflow-auto p-4">
                    <StatBonuses {...bonuses} />
                </div>
            );
        case 'equipment':
            return <Equipment>{equipment}</Equipment>;
        default:
            return (
                <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col">
                    <div className="flex-1 min-h-0">
                        <MissionMap {...map} />
                    </div>
                </div>
            );
    }
}
