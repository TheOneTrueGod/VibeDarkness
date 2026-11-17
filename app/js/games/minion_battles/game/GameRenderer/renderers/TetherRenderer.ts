import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { TeamId } from '../../teams';
import { getUnitDetection, isDetectionVisible } from '../../visibility/teamPerception';
import { listLiveTethers, tetherVinePoints, tetherSwayPhase } from '../../tethers/tether';

/** Just under units (10) so a vine passes beneath the bodies it joins. */
const Z_TETHER = 9;
const VINE_DARK = 0x1f4d2b;
const VINE_LIGHT = 0x4f9a57;
const VINE_WIDTH = 7;
const VINE_CORE_WIDTH = 3;
const LEAF_SIZE = 4;

/**
 * Draws Stem tethers (`game/tethers/tether.ts`) as a segmented vine with a travelling wave, from the parent end to
 * the child end. Runs on wall time so the sway keeps going while the game is paused, and hides a vine when the
 * local team cannot see either end.
 */
export class TetherRenderer {
    private readonly graphics: Graphics = new Graphics();

    constructor(private readonly gameContainer: Container) {
        this.graphics.zIndex = Z_TETHER;
        this.graphics.label = 'tethers';
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

        for (const seg of listLiveTethers(engine)) {
            const child = engine.getUnit(seg.childId);
            const parent = engine.getUnit(seg.parentId);
            if (!child || !parent) continue;
            if (
                !isDetectionVisible(getUnitDetection(engine, localTeamId, child))
                && !isDetectionVisible(getUnitDetection(engine, localTeamId, parent))
            ) {
                continue;
            }
            const points = tetherVinePoints(seg, timeSec);

            g.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
            g.stroke({ color: VINE_DARK, width: VINE_WIDTH, alpha: 0.95, cap: 'round', join: 'round' });

            g.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
            g.stroke({ color: VINE_LIGHT, width: VINE_CORE_WIDTH, alpha: 0.9, cap: 'round', join: 'round' });

            // Segment joints: a small leaf on alternating sides, so the vine reads as jointed.
            const phase = tetherSwayPhase(seg.childId);
            for (let i = 1; i < points.length - 1; i++) {
                const prev = points[i - 1];
                const next = points[i + 1];
                const tx = next.x - prev.x;
                const ty = next.y - prev.y;
                const len = Math.hypot(tx, ty) || 1;
                const side = (i % 2 === 0 ? 1 : -1) * (1 + Math.sin(timeSec * 2 + phase + i) * 0.25);
                const lx = points[i].x + (-ty / len) * LEAF_SIZE * side;
                const ly = points[i].y + (tx / len) * LEAF_SIZE * side;
                g.circle(lx, ly, LEAF_SIZE * 0.6);
                g.fill({ color: VINE_LIGHT, alpha: 0.85 });
            }
        }
    }

    destroy(): void {
        this.graphics.destroy();
    }
}
