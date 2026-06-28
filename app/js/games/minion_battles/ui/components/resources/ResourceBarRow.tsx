import type { ResourceDisplay } from '../../../resources/Resource';
import { ResourceIcon } from './ResourceIcon';
import { AmmoBar } from './AmmoBar';
import { EarthPowerBar } from './EarthPowerBar';
import { GravityBar } from './GravityBar';
import { LightBar } from './LightBar';
import { GenericResourceBar } from './GenericResourceBar';

interface ResourceBarRowProps {
    resource: ResourceDisplay;
}

function ResourceBarContent({ resource }: { resource: ResourceDisplay }) {
    switch (resource.id) {
        case 'ammo':
            return <AmmoBar current={resource.current} max={resource.max} />;
        case 'earth_power':
            return <EarthPowerBar current={resource.current} max={resource.max} />;
        case 'gravity':
            return <GravityBar current={resource.current} max={resource.max} />;
        case 'light':
            return <LightBar current={resource.current} max={resource.max} />;
        default:
            return <GenericResourceBar resource={resource} />;
    }
}

export function ResourceBarRow({ resource }: ResourceBarRowProps) {
    return (
        <div className="group relative flex items-center gap-1.5">
            {/* Tooltip */}
            <div className="pointer-events-none absolute -top-6 left-0 z-10 whitespace-nowrap rounded bg-dark-800 px-1.5 py-0.5 text-[10px] text-gray-200 opacity-0 shadow transition-opacity duration-100 group-hover:opacity-100">
                {resource.name}
            </div>
            {/* Icon with current-value badge overlaid */}
            <div className="relative shrink-0">
                <ResourceIcon
                    name={resource.iconName}
                    size={16}
                    className="text-gray-400"
                />
                <span
                    className="absolute -bottom-0.5 -right-1 rounded px-0.5 text-[8px] font-bold leading-none text-white"
                    style={{ textShadow: '0 0 3px #000, 0 0 3px #000' }}
                >
                    {resource.current}
                </span>
            </div>
            {/* Bar — fixed width so all resource types align */}
            <div className="w-[160px] shrink-0">
                <ResourceBarContent resource={resource} />
            </div>
        </div>
    );
}
