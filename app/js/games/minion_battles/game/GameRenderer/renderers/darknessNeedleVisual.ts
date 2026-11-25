import { Container, Graphics } from 'pixi.js';
import type { Unit } from '../../units/Unit';
import { darknessNeedlePoses, darknessPoolShape } from '../../units/darknessCorruption';
import {
    DEFAULT_DARKNESS_CORRUPTION_LOOK,
    type DarknessCorruptionLook,
} from '../../units/darknessCorruptionLook';

const NEEDLE_LABEL = 'darknessNeedles';
const POOL_LABEL = 'darknessPool';
const LEGACY_BAR_LABEL = 'corruptionBar';

function findGraphic(visual: Container, label: string): Graphics | undefined {
    return visual.children.find((child) => child.label === label) as Graphics | undefined;
}

function ensureGraphic(visual: Container, label: string, atBottom: boolean): Graphics {
    let graphic = findGraphic(visual, label);
    if (!graphic) {
        graphic = new Graphics();
        graphic.label = label;
        if (atBottom) visual.addChildAt(graphic, 0);
        else visual.addChild(graphic);
    }
    return graphic;
}

/**
 * Draw darkness corruption from the unit's serialized progress and strike timer: the needle ring over the
 * unit and, when the look has one, the ground pool under it. The pool's wobble runs on `wallSeconds`, so it
 * keeps moving while the battle is paused.
 */
export function syncDarknessNeedles(
    visual: Container,
    unit: Unit,
    wallSeconds: number,
    look: DarknessCorruptionLook = DEFAULT_DARKNESS_CORRUPTION_LOOK,
): void {
    const legacyBar = visual.children.find((child) => child.label === LEGACY_BAR_LABEL);
    if (legacyBar) legacyBar.visible = false;

    const active = unit.corruptionProgress > 0 || unit.darknessStrikeElapsed != null;
    if (!active) {
        const needles = findGraphic(visual, NEEDLE_LABEL);
        if (needles) needles.visible = false;
        const pool = findGraphic(visual, POOL_LABEL);
        if (pool) pool.visible = false;
        return;
    }

    if (look.pool) {
        const style = look.pool;
        const pool = ensureGraphic(visual, POOL_LABEL, true);
        pool.visible = true;
        pool.clear();
        const shape = darknessPoolShape(unit.radius, unit.corruptionProgress, unit.darknessStrikeElapsed, wallSeconds, style);
        const core = shape.points.map((v) => v * style.coreShare);
        pool.poly(shape.points, true);
        pool.fill({ color: style.rimColor, alpha: Math.min(1, style.rimAlpha * shape.alpha) });
        pool.poly(core, true);
        pool.fill({ color: style.coreColor, alpha: Math.min(1, style.coreAlpha * shape.alpha) });
        pool.poly(shape.points, true);
        pool.stroke({ color: style.edgeColor, width: style.edgeWidth, alpha: Math.min(1, style.edgeAlpha * shape.alpha) });
    } else {
        const pool = findGraphic(visual, POOL_LABEL);
        if (pool) pool.visible = false;
    }

    const style = look.needles;
    const graphic = ensureGraphic(visual, NEEDLE_LABEL, false);
    graphic.visible = true;
    graphic.clear();
    const poses = darknessNeedlePoses(unit.radius, unit.corruptionProgress, unit.darknessStrikeElapsed, style);
    if (style.glow) {
        for (const pose of poses) {
            if (!pose.visible) continue;
            graphic.poly(pose.points, true);
            graphic.stroke({ color: style.glow.color, width: style.glow.width, alpha: style.glow.alpha, join: 'round' });
        }
    }
    for (const pose of poses) {
        if (!pose.visible) continue;
        graphic.poly(pose.points, true);
        graphic.fill({ color: style.fill });
        graphic.stroke({ color: style.outline, width: style.outlineWidth, join: 'round' });
    }
}
