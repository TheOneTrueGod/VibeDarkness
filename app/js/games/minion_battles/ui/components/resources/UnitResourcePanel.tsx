import { useSyncExternalStore } from 'react';
import { Heart } from 'lucide-react';
import type { Unit } from '../../../game/units/Unit';
import { PLAYER_CHARACTER_ID } from '../../../game/units/unit_defs/unitDef';
import { getPortrait } from '../../../character_defs/portraits';
import { HealthSegmentBar } from './HealthSegmentBar';
import { ResourceBarRow } from './ResourceBarRow';
import type { ResourceDisplay } from '../../../resources/Resource';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../../../resources/resourceDisplayDefs';
import {
    getResourceBarDebugEnabled,
    getResourceBarDebugFill,
    subscribeResourceBarDebug,
} from '../../../../../debugFlags';

interface UnitResourcePanelProps {
    unit: Unit | null;
}

export function UnitResourcePanel({ unit }: UnitResourcePanelProps) {
    const debugEnabled = useSyncExternalStore(
        subscribeResourceBarDebug,
        getResourceBarDebugEnabled,
        getResourceBarDebugEnabled,
    );
    const debugFill = useSyncExternalStore(
        subscribeResourceBarDebug,
        getResourceBarDebugFill,
        getResourceBarDebugFill,
    );

    if (!unit) return null;

    const portraitPicture =
        unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId
            ? getPortrait(unit.portraitId)?.picture
            : undefined;

    const displayHp = debugEnabled ? Math.round((debugFill / 100) * unit.maxHp) : unit.hp;

    const displayResources: ResourceDisplay[] = debugEnabled
        ? ALL_RESOURCE_DISPLAY_DEFS.map((def) => ({
              ...def,
              current: Math.round((debugFill / 100) * def.max),
          }))
        : unit.resources;

    return (
        <div className="flex w-full flex-row gap-3 border-r border-dark-700 bg-dark-900/60 p-4">
            {/* Portrait + health bar below */}
            <div className="flex w-[100px] shrink-0 flex-col gap-2">
                <div className="relative h-[100px] w-[100px] overflow-hidden rounded-lg bg-dark-800">
                    {portraitPicture ? (
                        <img
                            src={portraitPicture}
                            alt={unit.name}
                            className="h-full w-full object-cover object-top"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-gray-400">
                            {unit.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>

                {/* Heart icon + count + 4-segment bar */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-center gap-1">
                        <Heart size={12} className="shrink-0 text-red-400" />
                        <span className="text-[10px] tabular-nums text-gray-300">
                            {displayHp}/{unit.maxHp}
                        </span>
                    </div>
                    <HealthSegmentBar hp={displayHp} maxHp={unit.maxHp} />
                </div>
            </div>

            {/* Resource bars */}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
                {displayResources.map((resource) => (
                    <ResourceBarRow key={resource.id} resource={resource} />
                ))}
            </div>
        </div>
    );
}
