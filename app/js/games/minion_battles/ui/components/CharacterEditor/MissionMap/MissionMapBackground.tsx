import React from 'react';
import type { BuiltMapBackground } from './segmentGridBackground';

interface Props {
    background: BuiltMapBackground;
}

/**
 * Chapter background (e.g. the castle terrain) drawn under every divider, edge and node. Memoized:
 * the layout builds `background` once per chapter, so hover and tooltip re-renders skip the rects.
 */
function MissionMapBackground({ background }: Props) {
    return (
        <g
            data-classname="MissionMapBackground"
            opacity={background.opacity}
            shapeRendering="crispEdges"
            style={{ pointerEvents: 'none' }}
            aria-hidden
        >
            {background.rects.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={r.fill} />
            ))}
        </g>
    );
}

export default React.memo(MissionMapBackground);
