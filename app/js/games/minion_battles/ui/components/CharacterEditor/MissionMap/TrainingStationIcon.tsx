import React from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Training station map icon: an up arrow over a sphere, in the Lucide stroke style the other mission
 * icons use (24x24, round caps, `color` / `strokeWidth`). A soft dark copy under the arrow keeps it
 * readable where it crosses the sphere and gives the embossed look.
 */
export const TrainingStationIcon = React.forwardRef<SVGSVGElement, LucideProps>(function TrainingStationIcon(
    { color = 'currentColor', strokeWidth = 2, size = 24, width, height, ...rest },
    ref,
) {
    const arrow = 'M12 17V3M7.5 7.5 12 3l4.5 4.5';
    return (
        <svg
            ref={ref}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={width ?? size}
            height={height ?? size}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...rest}
        >
            {/* Sphere: outline, a faint fill for volume, the equator and a highlight. */}
            <circle cx="12" cy="14.5" r="7.5" fill={color} fillOpacity={0.18} />
            <path d="M4.5 14.5a7.5 2.75 0 0 0 15 0" strokeOpacity={0.7} />
            <path d="M8 10.5a5 5 0 0 1 2.5-2" strokeOpacity={0.6} />
            {/* Arrow: shadow first, then the arrow itself on top of the sphere. */}
            <path d={arrow} stroke="#000000" strokeOpacity={0.45} strokeWidth={Number(strokeWidth) + 2.5} transform="translate(0.5 0.75)" />
            <path d={arrow} />
        </svg>
    );
});
