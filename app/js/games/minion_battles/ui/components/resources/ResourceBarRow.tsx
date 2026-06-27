import type { Resource } from '../../../resources/Resource';
import { ResourceIcon } from './ResourceIcon';
import { AmmoBar } from './AmmoBar';
import { EarthPowerBar } from './EarthPowerBar';
import { GravityBar } from './GravityBar';
import { LightBar } from './LightBar';
import { GenericResourceBar } from './GenericResourceBar';

interface ResourceBarRowProps {
    resource: Resource;
}

function ResourceBarContent({ resource }: ResourceBarRowProps) {
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
        <div className="flex items-center gap-1.5">
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
            {/* Bar fills remaining space */}
            <div className="min-w-0 flex-1">
                <ResourceBarContent resource={resource} />
            </div>
        </div>
    );
}
