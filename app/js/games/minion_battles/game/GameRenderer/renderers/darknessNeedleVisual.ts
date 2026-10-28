import { Container, Graphics } from 'pixi.js';
import type { Unit } from '../../units/Unit';
import {
    DARKNESS_NEEDLE_FILL,
    DARKNESS_NEEDLE_OUTLINE,
    DARKNESS_NEEDLE_OUTLINE_WIDTH,
    darknessNeedlePoses,
} from '../../units/darknessCorruption';

const NEEDLE_LABEL = 'darknessNeedles';
const LEGACY_BAR_LABEL = 'corruptionBar';

/** Draw the corruption needle ring from the unit's serialized progress and strike timer. */
export function syncDarknessNeedles(visual: Container, unit: Unit): void {
    const legacyBar = visual.children.find((child) => child.label === LEGACY_BAR_LABEL);
    if (legacyBar) legacyBar.visible = false;

    let graphic = visual.children.find((child) => child.label === NEEDLE_LABEL) as Graphics | undefined;
    const active = unit.corruptionProgress > 0 || unit.darknessStrikeElapsed != null;
    if (!active) {
        if (graphic) graphic.visible = false;
        return;
    }
    if (!graphic) {
        graphic = new Graphics();
        graphic.label = NEEDLE_LABEL;
        visual.addChild(graphic);
    }
    graphic.visible = true;
    graphic.clear();
    const poses = darknessNeedlePoses(unit.radius, unit.corruptionProgress, unit.darknessStrikeElapsed);
    for (const pose of poses) {
        if (!pose.visible) continue;
        graphic.poly(pose.points, true);
        graphic.fill({ color: DARKNESS_NEEDLE_FILL });
        graphic.stroke({ color: DARKNESS_NEEDLE_OUTLINE, width: DARKNESS_NEEDLE_OUTLINE_WIDTH });
    }
}
