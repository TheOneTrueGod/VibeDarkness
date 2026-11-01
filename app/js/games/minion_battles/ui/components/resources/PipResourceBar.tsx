import type { ResourceDisplay } from '../../../resources/Resource';

interface PipResourceBarProps {
    resource: ResourceDisplay;
}

/** Orb diameter, in pixels. */
const PIP_SIZE = 10;

/**
 * One orb per point of `max`, filled for each point of `current`, packed from the left.
 * Orbs wrap onto another row when there are more than fit, so a larger max still fits the bar.
 */
export function PipResourceBar({ resource }: PipResourceBarProps) {
    const count = Math.max(0, Math.floor(resource.max));
    const filled = Math.floor(resource.current);
    return (
        <div className="flex min-h-4 flex-wrap items-center gap-[3px]">
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    className="shrink-0 rounded-full transition-colors duration-100"
                    style={{
                        width: PIP_SIZE,
                        height: PIP_SIZE,
                        border: `1px solid ${resource.color}`,
                        backgroundColor: i < filled ? resource.color : 'transparent',
                        boxShadow: i < filled ? `0 0 3px ${resource.color}` : undefined,
                        opacity: i < filled ? 1 : 0.45,
                    }}
                />
            ))}
        </div>
    );
}
