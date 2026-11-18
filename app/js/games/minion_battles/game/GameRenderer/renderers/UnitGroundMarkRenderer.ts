import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { TeamId } from '../../teams';
import type { Unit } from '../../units/Unit';
import { getUnitDetection, isDetectionVisible } from '../../visibility/teamPerception';
import {
    BURROW_HOLE_COLOR,
    resolveBurrowRender,
    resolveFusedBodyTelegraph,
    type BurrowRender,
    type FusedBodyTelegraph,
} from '../../units/unitRenderOptions';
import { drawBurrowMound, drawBurrowTrail } from './burrowTrailDrawing';

/** Just under units (10) and level with tethers, so ground marks never cover a body. */
export const Z_GROUND_MARKS = 9;

/**
 * Ground marks that belong to a unit's state rather than to its body, painted on one Graphics under the unit layer.
 * Everything is derived from serialized state each frame, so it is reconnect-safe and holds still at a pause plane.
 * Resolvers are in `units/unitRenderOptions.ts`:
 *
 * - **Burrow:** the dark hole and dirt lip where a unit sinks or rises (the clip that hides the sunk body is in
 *   `UnitRenderer`), and the churned trail from where it went under to where it will come up.
 * - **Fused body telegraph:** the red blast circle for the last stretch of the fuse, with an inner fill growing to
 *   the burst edge.
 */
export class UnitGroundMarkRenderer {
    private readonly graphics: Graphics = new Graphics();

    constructor(private readonly gameContainer: Container) {
        this.graphics.zIndex = Z_GROUND_MARKS;
        this.graphics.label = 'unitGroundMarks';
        this.graphics.eventMode = 'none';
        this.gameContainer.addChild(this.graphics);
    }

    setLayerVisible(visible: boolean): void {
        if (!visible) this.graphics.visible = false;
    }

    render(engine: GameEngine, localTeamId: TeamId): void {
        const g = this.graphics;
        g.clear();
        g.visible = true;
        const timeSec = performance.now() / 1000;

        for (const unit of engine.units) {
            if (!unit.active) continue;
            const burrow = resolveBurrowRender(unit, engine.tickTime);
            const telegraph = burrow ? null : resolveFusedBodyTelegraph(unit);
            if (!burrow && !telegraph) continue;
            if (!isDetectionVisible(getUnitDetection(engine, localTeamId, unit))) continue;
            if (burrow) this.drawBurrow(g, unit, burrow);
            if (telegraph) this.drawTelegraph(g, telegraph, timeSec);
        }
    }

    private drawBurrow(g: Graphics, unit: Unit, b: BurrowRender): void {
        const { fromX, fromY, toX, toY } = b.visual.trail;
        const r = unit.radius;
        const stage = b.visual.stage;

        // Resprout eruption: the same red circle as a fuse telegraph, filling over the rise.
        if (b.eruption) this.drawTelegraph(g, b.eruption, performance.now() / 1000);

        // The trail: a faint run of churned earth from the sink point to the rise point, so the party can see where
        // it is going. Brightest while travelling.
        const trailAlpha = stage === 'travel' ? 0.55 : 0.22;
        drawBurrowTrail(g, { x: fromX, y: fromY }, { x: toX, y: toY }, r, b.dirtColor, trailAlpha);

        if (stage === 'travel') {
            // A moving mound: heaped earth on the burrower's heels, fading along the path behind it.
            const len = Math.hypot(toX - fromX, toY - fromY);
            const ux = len > 1 ? (toX - fromX) / len : 0;
            const uy = len > 1 ? (toY - fromY) / len : 0;
            drawBurrowMound(g, unit.x, unit.y, ux, uy, r, b.dirtColor);
            return;
        }

        // Sinking or rising: a dark hole at the ground line with a dirt lip over it, sized to the body.
        const progress = b.visual.stageProgress;
        const hole =
            stage === 'close' ? 0 : stage === 'sink' ? Math.min(1, b.visual.depth * 3) : Math.min(1, (1 - progress) * 3 + 0.4);
        if (hole <= 0) return;
        const cx = unit.x;
        const cy = b.groundLineY;
        g.ellipse(cx, cy, r * 1.15 * hole, r * 0.32 * hole);
        g.fill({ color: BURROW_HOLE_COLOR, alpha: 0.55 });
        g.moveTo(cx - r * 1.2 * hole, cy);
        g.quadraticCurveTo(cx, cy + r * 0.5 * hole, cx + r * 1.2 * hole, cy);
        g.stroke({ color: b.dirtColor, width: 3, alpha: 0.85, cap: 'round' });
    }

    private drawTelegraph(g: Graphics, t: FusedBodyTelegraph, timeSec: number): void {
        // Soft ground tint, a solid rim that breathes, and an inner disc that grows to the burst edge.
        g.circle(t.x, t.y, t.radiusPx);
        g.fill({ color: t.color, alpha: 0.1 });
        g.circle(t.x, t.y, t.radiusPx * t.fill);
        g.fill({ color: t.color, alpha: 0.22 });
        const rim = 0.7 + Math.sin(timeSec * 9) * 0.15;
        g.circle(t.x, t.y, t.radiusPx);
        g.stroke({ color: t.color, width: 2.5, alpha: rim });
    }

    destroy(): void {
        this.graphics.destroy();
    }
}
