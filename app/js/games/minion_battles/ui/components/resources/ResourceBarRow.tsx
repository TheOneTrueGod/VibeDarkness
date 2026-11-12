import type { ResourceDisplay } from '../../../resources/Resource';
import { ResourceIcon } from './ResourceIcon';
import { AmmoBar } from './AmmoBar';
import { RockBar } from './RockBar';
import { GravityBar } from './GravityBar';
import { LightBar } from './LightBar';
import { GenericResourceBar } from './GenericResourceBar';
import { PipResourceBar } from './PipResourceBar';
import { LiquidResourceBar } from './LiquidResourceBar';

interface ResourceBarRowProps {
    resource: ResourceDisplay;
}

function ResourceBarContent({ resource }: { resource: ResourceDisplay }) {
    switch (resource.id) {
        case 'ammo':
            return <AmmoBar current={resource.current} max={resource.max} />;
        case 'rock':
            return <RockBar current={resource.current} max={resource.max} />;
        case 'gravity':
            return <GravityBar current={resource.current} max={resource.max} />;
        case 'light':
            return <LightBar current={resource.current} max={resource.max} />;
        default:
            switch (resource.barStyle) {
                case 'pips':
                    return <PipResourceBar resource={resource} />;
                case 'liquid':
                    return <LiquidResourceBar resource={resource} />;
                default:
                    return <GenericResourceBar resource={resource} />;
            }
    }
}

/** A leading "+N" (e.g. "+0.5/s in or beside water") is drawn in the resource colour. */
const LEADING_GAIN_RE = /^\+(\d+(?:\.\d+)?)(.*)$/;

/** One `tooltipLines` entry. The first line reads as the headline; later lines are muted. */
function TooltipLine({ line, color, muted }: { line: string; color: string; muted: boolean }) {
    const gain = LEADING_GAIN_RE.exec(line);
    return (
        <div className={`whitespace-nowrap${muted ? ' text-gray-400' : ''}`}>
            {gain ? (
                <>
                    +<span style={{ color }}>{gain[1]}</span>{gain[2]}
                </>
            ) : (
                line
            )}
        </div>
    );
}

export function ResourceBarRow({ resource }: ResourceBarRowProps) {
    return (
        <div className="group relative flex items-center gap-1.5">
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full mb-0.5 left-0 z-10 rounded border border-gray-200 bg-black px-1.5 py-0.5 text-[10px] text-gray-200 opacity-0 shadow transition-opacity duration-100 group-hover:opacity-100">
                <div className="whitespace-nowrap">{resource.name}</div>
                {resource.perRoundGain !== undefined && (
                    <div className="whitespace-nowrap">
                        +<span style={{ color: '#fef08a' }}>{resource.perRoundGain}</span> per round
                    </div>
                )}
                {resource.tooltipLines?.map((line, i) => (
                    <TooltipLine key={i} line={line} color={resource.color} muted={i > 0} />
                ))}
                {/* `tooltipLines` already say how the resource fills, so they replace the live "+N/s" line. */}
                {resource.tooltipLines === undefined && resource.perSecondGain !== undefined && resource.perSecondGain > 0 && (
                    <div className="whitespace-nowrap">
                        + <span style={{ color: resource.color }}>{resource.perSecondGain.toFixed(1)}</span>/s
                    </div>
                )}
            </div>
            {/* Icon with current-value badge overlaid */}
            <div className="relative shrink-0">
                <ResourceIcon
                    resourceId={resource.id}
                    size={20}
                />
                <span
                    className="absolute -bottom-0.5 -right-1 rounded px-0.5 text-[8px] font-bold leading-none text-white"
                    style={{ textShadow: '0 0 3px #000, 0 0 3px #000' }}
                >
                    {Math.floor(resource.current)}
                </span>
            </div>
            {/* Bar — fixed width so all resource types align */}
            <div className="w-[160px] shrink-0">
                <ResourceBarContent resource={resource} />
            </div>
        </div>
    );
}
