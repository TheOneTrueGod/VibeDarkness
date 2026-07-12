import { useState, useSyncExternalStore } from 'react';
import { Heart, Footprints, Shield } from 'lucide-react';
import type { Unit } from '../../../game/units/Unit';
import { PLAYER_CHARACTER_ID } from '../../../game/units/unit_defs/unitDef';
import { getPortrait } from '../../../character_defs/portraits';
import { HealthSegmentBar } from './HealthSegmentBar';
import { ResourceBarRow } from './ResourceBarRow';
import type { ResourceDisplay } from '../../../resources/Resource';
import { ALL_RESOURCE_DISPLAY_DEFS, SHIELD_RESOURCE_COLOR } from '../../../resources/resourceDisplayDefs';
import { PORTAL_TOOLTIP_SURFACE_CLASS } from '../AnchoredPortalTooltip';
import { getTotalShieldHp } from '../../../game/units/unitShield';
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
    // Shared by the heart+number row and the health bar so hovering either shows the same
    // tooltip; the movement (footprints) icons are a sibling and deliberately not wired in.
    const [hpTooltipOpen, setHpTooltipOpen] = useState(false);
    const showHpTooltip = () => setHpTooltipOpen(true);
    const hideHpTooltip = () => setHpTooltipOpen(false);

    if (!unit) return null;

    const portraitPicture =
        unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId
            ? getPortrait(unit.portraitId)?.picture
            : undefined;

    const displayHp = debugEnabled ? Math.round((debugFill / 100) * unit.maxHp) : unit.hp;
    const displayHpInjury = debugEnabled ? 0 : unit.hpInjury;
    const displayEffectiveMaxHp = Math.ceil(unit.getEffectiveMaxHp());
    const totalShieldHp = getTotalShieldHp(unit);

    const allResources: ResourceDisplay[] = debugEnabled
        ? ALL_RESOURCE_DISPLAY_DEFS.map((def) => ({
              ...def,
              current: Math.round((debugFill / 100) * def.max),
          }))
        : unit.resources;

    // Movement is rendered as shoe icons in the HP row; exclude from generic bars
    const displayResources = allResources.filter((r) => r.id !== 'movement_points');
    const movementResource = allResources.find((r) => r.id === 'movement_points');
    const movementCount = movementResource ? Math.floor(movementResource.current) : 0;

    return (
        <div className="flex w-full flex-row gap-3 bg-dark-900/60">
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
                <div className="flex w-full flex-col gap-1">
                    <div className="relative flex w-full items-center justify-between">
                        <div
                            className="flex items-center gap-2"
                            onMouseEnter={showHpTooltip}
                            onMouseLeave={hideHpTooltip}
                        >
                            <div className="flex items-center gap-1">
                                <Heart size={12} className="shrink-0 text-red-400" />
                                <span className="text-[10px] tabular-nums text-gray-300">
                                    {Math.ceil(displayHp)}/{displayEffectiveMaxHp}
                                </span>
                            </div>
                            {totalShieldHp > 0 && (
                                <div className="flex items-center gap-1">
                                    <Shield size={12} className="shrink-0" style={{ color: SHIELD_RESOURCE_COLOR }} />
                                    <span className="text-[10px] tabular-nums" style={{ color: SHIELD_RESOURCE_COLOR }}>
                                        {Math.ceil(totalShieldHp)}
                                    </span>
                                </div>
                            )}
                        </div>
                        {movementResource && (
                            <div className="flex items-center gap-0.5" title="Movement Points">
                                {Array.from({ length: movementResource.max }, (_, i) => (
                                    <Footprints
                                        key={i}
                                        size={10}
                                        className={i < movementCount ? 'text-green-400' : 'text-gray-600'}
                                    />
                                ))}
                            </div>
                        )}
                        {hpTooltipOpen && (
                            <div
                                role="tooltip"
                                className={`pointer-events-none absolute bottom-full left-0 z-10 mb-1 whitespace-nowrap px-2 py-1 text-[10px] leading-tight ${PORTAL_TOOLTIP_SURFACE_CLASS}`}
                            >
                                <div>Current Health: {Math.ceil(displayHp)}</div>
                                <div>Max Health: {displayEffectiveMaxHp}</div>
                                <div>Injury: {Math.ceil(displayHpInjury)}</div>
                                {totalShieldHp > 0 && <div>Shield: {Math.ceil(totalShieldHp)}</div>}
                            </div>
                        )}
                    </div>
                    <div onMouseEnter={showHpTooltip} onMouseLeave={hideHpTooltip}>
                        <HealthSegmentBar hp={displayHp} maxHp={unit.maxHp} hpInjury={displayHpInjury} shieldHp={totalShieldHp} />
                    </div>
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
