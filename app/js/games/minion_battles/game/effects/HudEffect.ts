/**
 * HudEffect - Screen-space visual effect rendered in the HUD layer.
 *
 * Unlike Effect (world-space), HudEffects have no x/y world position.
 * They render in the viewport-fixed hudContainer on app.stage.
 * Never serialized; continue animating during game pause.
 */

let _hudFxCounter = 0;
function generateHudEffectId(type: string): string {
    return `hud_${type}_${++_hudFxCounter}`;
}

export abstract class HudEffect {
    readonly id: string;
    /** String key the HudEffectLayer uses to decide how to draw this effect. */
    readonly hudEffectType: string;
    duration: number;
    elapsed: number = 0;
    active: boolean = true;
    /** Optional payload for effect-type-specific data. */
    effectData: Record<string, unknown> = {};

    constructor(hudEffectType: string, duration: number) {
        this.id = generateHudEffectId(hudEffectType);
        this.hudEffectType = hudEffectType;
        this.duration = duration;
    }

    /** Progress 0..1 through the effect's lifetime. */
    get progress(): number {
        return Math.min(this.elapsed / this.duration, 1);
    }

    renderUpdate(realDt: number): void {
        if (!this.active) return;
        this.elapsed += realDt;
        if (this.elapsed >= this.duration) this.active = false;
    }
}
