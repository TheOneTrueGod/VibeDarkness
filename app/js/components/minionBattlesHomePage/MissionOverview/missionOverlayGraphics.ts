import { Container, Graphics, Text } from 'pixi.js';
import {
    MISSION_OVERLAY_LAYERS,
    type MissionOverlayLayer,
    type MissionOverlayShape,
} from '../../../games/minion_battles/storylines/missionOverview/missionOverlayShapes';

const MARKER_RADIUS = 10;
/** Large enough to read at the default 0.5 zoom. */
const LABEL_STYLE = { fontSize: 22, fill: 0xffffff, fontFamily: 'sans-serif', stroke: { color: 0x000000, width: 3 } };

/** Draws the enabled layers' shapes into a fresh world-space container (for `GameRenderer.setWorldOverlay`). */
export function buildMissionOverlayContainer(
    shapes: readonly MissionOverlayShape[],
    enabled: ReadonlySet<MissionOverlayLayer>,
): Container {
    const root = new Container({ label: 'missionOverviewOverlay' });
    const colorOf = new Map(MISSION_OVERLAY_LAYERS.map((l) => [l.id, l.color]));
    const g = new Graphics();
    root.addChild(g);

    for (const shape of shapes) {
        if (!enabled.has(shape.layer)) continue;
        const color = colorOf.get(shape.layer) ?? 0xffffff;
        const geo = shape.geometry;
        let labelX: number;
        let labelY: number;
        switch (geo.type) {
            case 'rect':
                g.rect(geo.x, geo.y, geo.width, geo.height).fill({ color, alpha: 0.15 }).stroke({ width: 2, color, alpha: 0.9 });
                labelX = geo.x + 4;
                labelY = geo.y + 2;
                break;
            case 'ellipse':
                g.ellipse(geo.x, geo.y, geo.rx, geo.ry).fill({ color, alpha: 0.15 }).stroke({ width: 2, color, alpha: 0.9 });
                labelX = geo.x - geo.rx + 4;
                labelY = geo.y - 8;
                break;
            case 'marker':
                g.circle(geo.x, geo.y, MARKER_RADIUS).fill({ color, alpha: 0.35 }).stroke({ width: 2, color });
                g.moveTo(geo.x - MARKER_RADIUS, geo.y).lineTo(geo.x + MARKER_RADIUS, geo.y).stroke({ width: 2, color });
                g.moveTo(geo.x, geo.y - MARKER_RADIUS).lineTo(geo.x, geo.y + MARKER_RADIUS).stroke({ width: 2, color });
                labelX = geo.x + MARKER_RADIUS + 3;
                labelY = geo.y - 8;
                break;
        }
        const label = new Text({ text: shape.label, style: LABEL_STYLE });
        label.position.set(labelX, labelY);
        root.addChild(label);
    }
    return root;
}
