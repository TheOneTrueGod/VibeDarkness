import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { RoundStartEvent } from '../../EventBus';
import { HudEffect } from '../../effects/HudEffect';
import {
    RoundStartBannerEffect,
    ResourceArrivalPulseEffect,
    type ResourceFlightData,
    type ResourceArrivalPulseData,
} from '../../effect_defs/hudEffects';

export class HudEffectLayer {
    private effects: HudEffect[] = [];
    private effectVisuals: Map<string, Container> = new Map();
    private engineSource: GameEngine | null = null;
    private readonly onRoundStartBound: (data: RoundStartEvent) => void;

    constructor(private readonly hudContainer: Container) {
        this.onRoundStartBound = this.onRoundStart.bind(this);
    }

    addEffect(effect: HudEffect): void {
        this.effects.push(effect);
    }

    /**
     * Called each render frame by GameRenderer.render().
     * Lazy-binds to the engine's event bus when the engine changes.
     * Continues running during game pause (render tick is independent of fixed update).
     * HudEffects are never serialized.
     */
    render(engine: GameEngine, vw: number, vh: number, realDt: number): void {
        if (engine !== this.engineSource) {
            if (this.engineSource) {
                this.engineSource.eventBus.off('round_start', this.onRoundStartBound);
            }
            this.engineSource = engine;
            engine.eventBus.on('round_start', this.onRoundStartBound);
        }

        // Advance all active effects; collect ResourceFlight arrival pulses to spawn.
        const toSpawn: HudEffect[] = [];
        const snapshot = this.effects.slice();
        for (const effect of snapshot) {
            effect.renderUpdate(realDt);

            if (effect.hudEffectType === 'ResourceFlight' && !effect.active) {
                const data = effect.effectData as ResourceFlightData & { pulseSent?: boolean };
                if (!data.pulseSent) {
                    data.pulseSent = true;
                    toSpawn.push(new ResourceArrivalPulseEffect(data.destX, data.destY, data.color));
                }
            }

            let visual = this.effectVisuals.get(effect.id);
            if (!visual) {
                visual = this.createHudVisual(effect);
                this.effectVisuals.set(effect.id, visual);
                this.hudContainer.addChild(visual);
            }
            visual.visible = effect.active;
            if (effect.active) {
                this.updateHudVisual(visual, effect, vw, vh);
            }
        }

        for (const e of toSpawn) this.effects.push(e);

        // Remove visuals for effects that have expired.
        for (const effect of this.effects) {
            if (!effect.active) {
                const visual = this.effectVisuals.get(effect.id);
                if (visual) {
                    this.hudContainer.removeChild(visual);
                    visual.destroy();
                    this.effectVisuals.delete(effect.id);
                }
            }
        }
        this.effects = this.effects.filter((e) => e.active);
    }

    destroy(): void {
        if (this.engineSource) {
            this.engineSource.eventBus.off('round_start', this.onRoundStartBound);
            this.engineSource = null;
        }
        for (const visual of this.effectVisuals.values()) {
            visual.destroy();
        }
        this.effectVisuals.clear();
        this.effects = [];
    }

    private onRoundStart(data: RoundStartEvent): void {
        if (data.roundNumber > 1) {
            this.addEffect(new RoundStartBannerEffect(data.roundNumber));
        }
    }

    // ─── Visual factory ───────────────────────────────────────────────────────

    private createHudVisual(effect: HudEffect): Container {
        switch (effect.hudEffectType) {
            case 'RoundStartBanner': return this.createRoundStartBanner(effect);
            case 'ScreenFlash': return new Graphics();
            case 'TeamworkText': return this.createTeamworkText();
            case 'ResourceFlight': return this.createResourceFlight(effect);
            case 'ResourceArrivalPulse': return this.createResourceArrivalPulse(effect);
            default: return new Container();
        }
    }

    private updateHudVisual(visual: Container, effect: HudEffect, vw: number, vh: number): void {
        switch (effect.hudEffectType) {
            case 'RoundStartBanner': return this.updateRoundStartBanner(visual, effect, vw, vh);
            case 'ScreenFlash': return this.updateScreenFlash(visual as Graphics, effect, vw, vh);
            case 'TeamworkText': return this.updateTeamworkText(visual, effect, vw, vh);
            case 'ResourceFlight': return this.updateResourceFlight(visual, effect, vw, vh);
            case 'ResourceArrivalPulse': return this.updateResourceArrivalPulse(visual as Graphics, effect);
        }
    }

    // ─── RoundStartBanner ────────────────────────────────────────────────────

    private createRoundStartBanner(effect: HudEffect): Container {
        const data = effect.effectData as { roundNumber: number };
        const container = new Container();

        const roundText = new Text({
            text: `Round ${data.roundNumber}`,
            style: new TextStyle({
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: 42,
                fontWeight: '800',
                fill: 0xffffff,
                stroke: { color: 0xf59e0b, width: 4 },
                dropShadow: { alpha: 0.7, angle: Math.PI / 2, blur: 10, color: 0x000000, distance: 4 },
            }),
        });
        roundText.anchor.set(0.5, 0.5);
        roundText.y = -28;

        const staminaText = new Text({
            text: 'Stamina Restored',
            style: new TextStyle({
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: 22,
                fontWeight: '700',
                fill: 0xf59e0b,
                dropShadow: { alpha: 0.6, angle: Math.PI / 2, blur: 6, color: 0x000000, distance: 2 },
            }),
        });
        staminaText.anchor.set(0.5, 0.5);
        staminaText.y = 28;

        container.addChild(roundText);
        container.addChild(staminaText);
        return container;
    }

    private updateRoundStartBanner(visual: Container, effect: HudEffect, vw: number, vh: number): void {
        const p = effect.progress;
        visual.x = vw / 2;
        visual.y = vh * 0.42;

        let scale: number;
        let alpha: number;
        let yOffset: number;

        if (p < 0.2) {
            // Pop in
            const t = p / 0.2;
            const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
            scale = 0.4 + 0.6 * ease;
            alpha = ease;
            yOffset = 0;
        } else if (p < 0.8) {
            // Hold
            scale = 1;
            alpha = 1;
            yOffset = 0;
        } else {
            // Float up + fade
            const t = (p - 0.8) / 0.2;
            scale = 1;
            alpha = 1 - t;
            yOffset = -t * 30;
        }

        visual.scale.set(scale);
        visual.alpha = alpha;
        visual.y += yOffset;
    }

    // ─── ScreenFlash ─────────────────────────────────────────────────────────

    private updateScreenFlash(g: Graphics, effect: HudEffect, vw: number, vh: number): void {
        const data = effect.effectData as { color: number; maxAlpha: number };
        const alpha = data.maxAlpha * Math.sin(effect.progress * Math.PI);
        g.clear();
        g.rect(0, 0, vw, vh);
        g.fill({ color: data.color, alpha });
    }

    // ─── TeamworkText ─────────────────────────────────────────────────────────

    private createTeamworkText(): Container {
        const t = new Text({
            text: 'TEAMWORK',
            style: new TextStyle({
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: 36,
                fontWeight: '800',
                fill: 0xfbbf24,
                stroke: { color: 0x78350f, width: 3 },
                dropShadow: { alpha: 0.85, angle: Math.PI / 2, blur: 8, color: 0x000000, distance: 2 },
            }),
        });
        t.anchor.set(0.5, 0.5);
        return t;
    }

    private updateTeamworkText(visual: Container, effect: HudEffect, vw: number, vh: number): void {
        const p = effect.progress;
        visual.x = vw / 2;

        let scale: number;
        let alpha: number;
        let yOffset: number;

        if (p < 0.12) {
            // Bounce in
            const t = p / 0.12;
            scale = 0.35 + 0.73 * t; // 0.35 → 1.08
            alpha = Math.min(1, t * 2);
            yOffset = 10 * (1 - t);
        } else {
            // Fade + drift up
            const t = (p - 0.12) / 0.88;
            scale = 1.08 - 0.06 * t; // slight scale decay
            alpha = 1 - t;
            yOffset = -52 * t;
        }

        visual.scale.set(scale);
        visual.alpha = alpha;
        visual.y = vh * 0.82 + yOffset;
    }

    // ─── ResourceFlight ───────────────────────────────────────────────────────

    private createResourceFlight(effect: HudEffect): Container {
        const data = effect.effectData as ResourceFlightData;
        const container = new Container();
        for (let i = 0; i < data.particleCount; i++) {
            const g = new Graphics();
            g.circle(0, 0, 3.5);
            g.fill({ color: data.color });
            container.addChild(g);
        }
        return container;
    }

    private updateResourceFlight(visual: Container, effect: HudEffect, vw: number, vh: number): void {
        const data = effect.effectData as ResourceFlightData;
        const p = effect.progress;

        for (let i = 0; i < data.particleCount; i++) {
            const g = visual.children[i] as Graphics;
            const particle = data.particles[i];
            if (!g || !particle) continue;

            const φ = particle.phaseOffset;
            const localT = Math.max(0, (p - φ) / (1 - φ));

            if (localT <= 0) {
                g.visible = false;
                continue;
            }
            g.visible = true;
            const t = Math.min(localT, 1);
            const mt = 1 - t;

            // Cubic bezier
            const bx = mt * mt * mt * data.sourceX +
                3 * mt * mt * t * particle.cx1 +
                3 * mt * t * t * particle.cx2 +
                t * t * t * data.destX;
            const by = mt * mt * mt * data.sourceY +
                3 * mt * mt * t * particle.cy1 +
                3 * mt * t * t * particle.cy2 +
                t * t * t * data.destY;

            // Clamp to canvas bounds
            g.x = Math.max(0, Math.min(vw, bx));
            g.y = Math.max(0, Math.min(vh, by));

            // Alpha: fade in 0→10%, full 10→85%, fade out 85→100%
            const fadeIn = Math.min(1, localT / 0.1);
            const fadeOut = localT > 0.85 ? Math.max(0, 1 - (localT - 0.85) / 0.15) : 1;
            g.alpha = fadeIn * fadeOut;
        }
    }

    // ─── ResourceArrivalPulse ────────────────────────────────────────────────

    private createResourceArrivalPulse(effect: HudEffect): Graphics {
        const data = effect.effectData as ResourceArrivalPulseData;
        const g = new Graphics();
        g.x = data.x;
        g.y = data.y;
        return g;
    }

    private updateResourceArrivalPulse(g: Graphics, effect: HudEffect): void {
        const data = effect.effectData as ResourceArrivalPulseData;
        const p = effect.progress;
        const radius = 4 + (24 - 4) * p;
        const alpha = 1 - p;
        g.clear();
        g.circle(0, 0, radius);
        g.stroke({ color: data.color, width: 2.5, alpha });
    }
}
