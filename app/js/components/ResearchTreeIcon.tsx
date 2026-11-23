import React from 'react';
import type { ResearchTreeDef } from '../researchTrees/types';

export interface ResearchTreeIconProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    /** The tree (or its resolved chrome): `icon` is drawn, `iconBackdrop` is a circle behind it. */
    source: Pick<ResearchTreeDef, 'icon' | 'iconBackdrop'>;
    /** Size classes, e.g. `h-4 w-4`. */
    className?: string;
}

/**
 * A research tree's icon. Trees with `iconBackdrop` draw it on a filled circle (for icons that
 * vanish on their own card fill); the rest keep the square, edge-to-edge crop.
 */
export default function ResearchTreeIcon({ source, className = '', style, alt = '', ...rest }: ResearchTreeIconProps) {
    const backdrop = source.iconBackdrop;
    return (
        <img
            {...rest}
            src={source.icon}
            alt={alt}
            className={`${className} shrink-0 ${backdrop ? 'rounded-full object-contain p-px' : 'rounded-sm object-cover'}`}
            style={backdrop ? { backgroundColor: backdrop, ...style } : style}
        />
    );
}
