import type { ResourceDisplay } from '../../../resources/Resource';

interface GenericResourceBarProps {
    resource: ResourceDisplay;
}

export function GenericResourceBar({ resource }: GenericResourceBarProps) {
    const fillPct = (resource.current / Math.max(resource.max, 1)) * 100;

    return (
        <div className="relative h-4 w-full overflow-hidden rounded bg-dark-700">
            <div
                className="absolute inset-y-0 left-0 rounded transition-[width] duration-150"
                style={{
                    width: `${fillPct}%`,
                    backgroundColor: resource.color,
                    opacity: 0.85,
                }}
            />
        </div>
    );
}
