import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { TeamId } from '../../teams';
import { getUnitDetection } from '../../visibility/teamPerception';
import { PULSE_STYLES, indicatorStyleForDetection, pulsePhaseOffset, pulseRings } from '../senseIndicatorStyles';

/** Above the darkness overlay (5) and daylight pulse (6), below knockback shadows (9) and units (10). */
const Z_SENSE_INDICATORS = 8;

/**
 * Ring pulses at units the local team only senses (heard, felt). Styles come from `senseIndicatorStyles.ts`
 * via each sense's `indicatorStyle`. Runs on wall time (`performance.now()`), so pulses keep playing while
 * the game is paused.
 */
export class SenseIndicatorRenderer {
    private readonly graphics: Graphics = new Graphics();

    constructor(private readonly gameContainer: Container) {
        this.graphics.zIndex = Z_SENSE_INDICATORS;
        this.graphics.label = 'senseIndicators';
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
        const wallTimeSec = performance.now() / 1000;
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive()) continue;
            const styleId = indicatorStyleForDetection(getUnitDetection(engine, localTeamId, unit));
            if (!styleId) continue;
            const style = PULSE_STYLES[styleId];
            for (const ring of pulseRings(style, wallTimeSec, pulsePhaseOffset(unit.id))) {
                if (ring.alpha <= 0) continue;
                g.circle(unit.x, unit.y, ring.radiusScale * unit.radius);
                g.stroke({ color: style.color, width: style.lineWidth, alpha: ring.alpha });
            }
        }
    }

    destroy(): void {
        this.graphics.destroy();
    }
}
