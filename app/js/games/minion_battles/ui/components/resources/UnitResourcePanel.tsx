import { useSyncExternalStore } from 'react';
import { Heart, Footprints } from 'lucide-react';
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

    const allResources: ResourceDisplay[] = debugEnabled
        ? ALL_RESOURCE_DISPLAY_DEFS.map((def) => ({
              ...def,
              current: Math.round((debugFill / 100) * def.max),
          }))
        : unit.resources;

    // Movement is rendered as shoe icons in the HP row; exclude from generic bars
    const displayResources = allResources.filter((r) => r.id !== 'movement');
    const movementResource = allResources.find((r) => r.id === 'movement');
    const movementCount = movementResource ? Math.floor(movementResource.current) : 0;

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

                {/* Heart icon + count + shoe icons + 4-segment bar */}
                <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                        <Heart size={12} className="shrink-0 text-red-400" />
                        <span className="text-[10px] tabular-nums text-gray-300">
                            {displayHp}/{unit.maxHp}
                        </span>
                        {movementResource && (
                            <div className="flex items-center gap-0.5">
                                {movementCount <= 5
                                    ? Array.from({ length: movementCount }, (_, i) => (
                                          <Footprints key={i} size={10} className="text-green-400" />
                                      ))
                                    : (
                                          <>
                                              <Footprints size={10} className="text-green-400" />
                                              <span className="text-[10px] tabular-nums text-green-400">{movementCount}</span>
                                          </>
                                      )}
                            </div>
                        )}
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
