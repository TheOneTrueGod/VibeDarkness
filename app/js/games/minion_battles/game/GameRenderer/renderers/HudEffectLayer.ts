import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { RoundStartEvent } from '../../EventBus';
import { HudEffect } from '../../effects/HudEffect';
import {
    RoundStartBannerEffect,
    ResourceFlightEffect,
    ResourceArrivalPulseEffect,
    type RoundStartResourceGrant,
    type ResourceFlightData,
    type ResourceArrivalPulseData,
} from '../../effect_defs/hudEffects';

// Banner icon layout constants (shared between create and flight-spawn logic).
const ICON_W = 60;
const ICON_H = 52;
const ICON_GAP = 12;
const ICON_BASE_Y = 6; // y offset from banner container origin to icon row top
const BANNER_Y_FRAC = 0.40; // canvas-fraction for banner vertical center

// Hex colors for each charge type (matches recoveryChargeDefinitions.ts Tailwind classes).
const CHARGE_TYPE_COLORS: Record<string, number> = {
    staminaCharge: 0xd1d5db, // gray-300
    lightCharge: 0xfde047,   // yellow-300
    energyCharge: 0x67e8f9,  // cyan-300
    roundCharge: 0xffffff,   // white
};

function iconColor(chargeType: string): number {
    return CHARGE_TYPE_COLORS[chargeType] ?? 0xaaaaaa;
}

function iconsTotalWidth(count: number): number {
    return count * ICON_W + Math.max(0, count - 1) * ICON_GAP;
}

export class HudEffectLayer {
    private effects: HudEffect[] = [];
    private effectVisuals: Map<string, Container> = new Map();
    private engineSource: GameEngine | null = null;
    private readonly onRoundStartBound: (data: RoundStartEvent) => void;

    constructor(
        private readonly hudContainer: Container,
        private readonly hudTargets: ReadonlyMap<string, { x: number; y: number }>,
    ) {
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

        // Advance all active effects; collect deferred effects to spawn.
        const toSpawn: HudEffect[] = [];
        const snapshot = this.effects.slice();
        for (const effect of snapshot) {
            effect.renderUpdate(realDt);

            // Auto-spawn arrival pulse when a ResourceFlight completes.
            if (effect.hudEffectType === 'ResourceFlight' && !effect.active) {
                const data = effect.effectData as ResourceFlightData & { pulseSent?: boolean };
                if (!data.pulseSent) {
                    data.pulseSent = true;
                    toSpawn.push(new ResourceArrivalPulseEffect(data.destX, data.destY, data.color));
                }
            }

            // Spawn resource flights from banner icons when the hold phase starts.
            if (effect.hudEffectType === 'RoundStartBanner' && effect.active) {
                const bannerData = effect.effectData as { resources: RoundStartResourceGrant[]; flightSent?: boolean };
                if (!bannerData.flightSent && effect.progress >= 0.2) {
                    bannerData.flightSent = true;
                    this.spawnBannerFlights(bannerData.resources, vw, vh, toSpawn);
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
        if (data.roundNumber <= 1) return;

        const resources: RoundStartResourceGrant[] = [];
        const surgeAmount = data.staminaSurgeAmount ?? 0;
        if (surgeAmount > 0) {
            resources.push({ chargeType: 'staminaCharge', amount: surgeAmount, color: iconColor('staminaCharge') });
        }

        this.addEffect(new RoundStartBannerEffect(data.roundNumber, resources));
    }

    // ─── Flight spawning ─────────────────────────────────────────────────────

    private spawnBannerFlights(
        resources: RoundStartResourceGrant[],
        vw: number,
        vh: number,
        out: HudEffect[],
    ): void {
        if (resources.length === 0) return;

        const bannerCenterX = vw / 2;
        const bannerCenterY = vh * BANNER_Y_FRAC;
        const totalW = iconsTotalWidth(resources.length);

        // Collect registered card targets.
        const cardTargets = Array.from(this.hudTargets.entries())
            .filter(([key]) => key.startsWith('card:'))
            .map(([, pos]) => pos);

        // Fallback: fire to canvas bottom center if no cards are registered.
        const targets = cardTargets.length > 0
            ? cardTargets
            : [{ x: vw / 2, y: vh + 10 }];

        resources.forEach((res, i) => {
            const iconLeft = bannerCenterX - totalW / 2 + i * (ICON_W + ICON_GAP);
            const sourceX = iconLeft + ICON_W / 2;
            const sourceY = bannerCenterY + ICON_BASE_Y + ICON_H / 2;

            for (const dest of targets) {
                out.push(new ResourceFlightEffect({
                    sourceX,
                    sourceY,
                    destX: dest.x,
                    destY: dest.y,
                    color: res.color,
                    particleCount: 2 * res.amount,
                }));
            }
        });
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
        const data = effect.effectData as { roundNumber: number; resources: RoundStartResourceGrant[] };
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
        roundText.y = -30;
        container.addChild(roundText);

        if (data.resources.length > 0) {
            const totalW = iconsTotalWidth(data.resources.length);

            data.resources.forEach((res, i) => {
                const iconLeft = -totalW / 2 + i * (ICON_W + ICON_GAP);
                const col = res.color;

                // Rounded background + border
                const g = new Graphics();
                g.roundRect(iconLeft, ICON_BASE_Y, ICON_W, ICON_H, 10);
                g.fill({ color: col, alpha: 0.18 });
                g.roundRect(iconLeft, ICON_BASE_Y, ICON_W, ICON_H, 10);
                g.stroke({ color: col, width: 2, alpha: 0.9 });
                container.addChild(g);

                // Large amount number
                const numText = new Text({
                    text: String(res.amount),
                    style: new TextStyle({
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: 28,
                        fontWeight: '800',
                        fill: 0xffffff,
                        dropShadow: { alpha: 0.6, angle: Math.PI / 2, blur: 4, color: 0x000000, distance: 2 },
                    }),
                });
                numText.anchor.set(0.5, 0.5);
                numText.x = iconLeft + ICON_W / 2;
                numText.y = ICON_BASE_Y + ICON_H / 2 - 7;
                container.addChild(numText);

                // Small charge-type label
                const labelMap: Record<string, string> = {
                    staminaCharge: 'STAMINA',
                    roundCharge: 'ROUND',
                    energyCharge: 'ENERGY',
                    lightCharge: 'LIGHT',
                };
                const label = new Text({
                    text: labelMap[res.chargeType] ?? res.chargeType.toUpperCase(),
                    style: new TextStyle({
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: 9,
                        fontWeight: '700',
                        fill: col,
                        letterSpacing: 1,
                    }),
                });
                label.anchor.set(0.5, 0.5);
                label.x = iconLeft + ICON_W / 2;
                label.y = ICON_BASE_Y + ICON_H - 10;
                container.addChild(label);
            });
        }

        return container;
    }

    private updateRoundStartBanner(visual: Container, effect: HudEffect, vw: number, vh: number): void {
        const p = effect.progress;

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
        visual.x = vw / 2;
        visual.y = vh * BANNER_Y_FRAC + yOffset;
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
        const r = 10;
        for (let i = 0; i < data.particleCount; i++) {
            const g = new Graphics();
            g.circle(0, 0, r);
            g.fill({ color: data.color, alpha: 0.4 });
            g.circle(0, 0, r);
            g.stroke({ color: data.color, width: 2, alpha: 1 });
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
