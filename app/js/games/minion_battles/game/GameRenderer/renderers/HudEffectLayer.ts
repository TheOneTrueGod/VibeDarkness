import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { Camera } from '../../Camera';
import type { RoundStartEvent, RecoveryChargeGrantedEvent, BossExposedCcSuppressedEvent, UnitEnragedEvent } from '../../EventBus';
import { HudEffect } from '../../effects/HudEffect';
import {
    RoundStartBannerEffect,
    ResourceFlightEffect,
    ResourceArrivalPulseEffect,
    ResilientTextEffect,
    EnrageRingsEffect,
    type RoundStartResourceGrant,
    type ResourceFlightData,
    type ResourceArrivalPulseData,
    type ResilientTextData,
    type EnrageRingsData,
} from '../../effect_defs/hudEffects';

// Banner icon layout constants (shared between create and flight-spawn logic).
const ICON_CIRCLE_R = 28;           // radius of the main icon circle
const ICON_W = ICON_CIRCLE_R * 2;   // = 56, used for spacing calculations
const BADGE_R = 12;                 // radius of the count badge circle
const ICON_GAP = 12;
const ICON_BASE_Y = 6; // y offset from banner container origin to icon circle centre-y
const BANNER_Y_FRAC = 0.40; // canvas-fraction for banner vertical center

// Main (darker) and soft (lighter) hex color pairs per charge type.
// Must stay in sync with recoveryChargeDefinitions.ts mainHex / softHex.
// Must stay in sync with recoveryChargeDefinitions.ts mainHex / softHex.
const CHARGE_TYPE_MAIN_COLORS: Record<string, number> = {
    staminaCharge: 0xd97706, // amber-600
    lightCharge:   0xb45309, // amber-700
    energyCharge:  0x0e7490, // cyan-700
    roundCharge:   0x111827, // gray-900
};

const CHARGE_TYPE_SOFT_COLORS: Record<string, number> = {
    staminaCharge: 0xffffff, // white
    lightCharge:   0xfffbeb, // amber-50
    energyCharge:  0xecfeff, // cyan-50
    roundCharge:   0xffffff, // white
};

function iconColor(chargeType: string): number {
    return CHARGE_TYPE_MAIN_COLORS[chargeType] ?? 0x6b7280;
}

function iconSoftColor(chargeType: string): number {
    return CHARGE_TYPE_SOFT_COLORS[chargeType] ?? 0xf3f4f6;
}

function iconsTotalWidth(count: number): number {
    return count * ICON_W + Math.max(0, count - 1) * ICON_GAP;
}

export class HudEffectLayer {
    private effects: HudEffect[] = [];
    private effectVisuals: Map<string, Container> = new Map();
    private engineSource: GameEngine | null = null;
    private camera: Camera | null = null;
    private canvasPageOffset = { x: 0, y: 0 };
    private readonly onRoundStartBound: (data: RoundStartEvent) => void;
    private readonly onRecoveryChargeGrantedBound: (data: RecoveryChargeGrantedEvent) => void;
    private readonly onBossExposedCcSuppressedBound: (data: BossExposedCcSuppressedEvent) => void;
    private readonly onUnitEnragedBound: (data: UnitEnragedEvent) => void;

    constructor(
        private readonly hudContainer: Container,
        private readonly hudTargets: ReadonlyMap<string, { x: number; y: number }>,
    ) {
        this.onRoundStartBound = this.onRoundStart.bind(this);
        this.onRecoveryChargeGrantedBound = this.onRecoveryChargeGranted.bind(this);
        this.onBossExposedCcSuppressedBound = this.onBossExposedCcSuppressed.bind(this);
        this.onUnitEnragedBound = this.onUnitEnraged.bind(this);
    }

    addEffect(effect: HudEffect): void {
        this.effects.push(effect);
    }

    setCanvasPageOffset(x: number, y: number): void {
        this.canvasPageOffset = { x, y };
    }

    /**
     * Called each render frame by GameRenderer.render().
     * Lazy-binds to the engine's event bus when the engine changes.
     * Continues running during game pause (render tick is independent of fixed update).
     * HudEffects are never serialized.
     */
    render(engine: GameEngine, camera: Camera | null, vw: number, vh: number, realDt: number): void {
        this.camera = camera;

        if (engine !== this.engineSource) {
            if (this.engineSource) {
                this.engineSource.eventBus.off('round_start', this.onRoundStartBound);
                this.engineSource.eventBus.off('recovery_charge_granted', this.onRecoveryChargeGrantedBound);
                this.engineSource.eventBus.off('boss_exposed_cc_suppressed', this.onBossExposedCcSuppressedBound);
                this.engineSource.eventBus.off('unit_enraged', this.onUnitEnragedBound);
            }
            this.engineSource = engine;
            engine.eventBus.on('round_start', this.onRoundStartBound);
            engine.eventBus.on('recovery_charge_granted', this.onRecoveryChargeGrantedBound);
            engine.eventBus.on('boss_exposed_cc_suppressed', this.onBossExposedCcSuppressedBound);
            engine.eventBus.on('unit_enraged', this.onUnitEnragedBound);
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
            this.engineSource.eventBus.off('recovery_charge_granted', this.onRecoveryChargeGrantedBound);
            this.engineSource.eventBus.off('boss_exposed_cc_suppressed', this.onBossExposedCcSuppressedBound);
            this.engineSource.eventBus.off('unit_enraged', this.onUnitEnragedBound);
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
        const staminaSurgeAbilityIds = data.staminaSurgeAbilityIds ?? [];
        if (surgeAmount > 0 && staminaSurgeAbilityIds.length > 0) {
            resources.push({
                chargeType: 'staminaCharge',
                amount: surgeAmount,
                color: iconColor('staminaCharge'),
                targetAbilityIds: staminaSurgeAbilityIds,
            });
        }
        const roundChargeAbilityIds = data.roundChargeAbilityIds ?? [];
        if (roundChargeAbilityIds.length > 0) {
            resources.push({
                chargeType: 'roundCharge',
                amount: 1,
                color: iconColor('roundCharge'),
                targetAbilityIds: roundChargeAbilityIds,
            });
        }

        this.addEffect(new RoundStartBannerEffect(data.roundNumber, resources));
    }

    private onRecoveryChargeGranted(data: RecoveryChargeGrantedEvent): void {
        const engine = this.engineSource;
        const camera = this.camera;
        if (!engine || !camera) return;

        const unit = engine.getUnit(data.unitId);
        if (!unit || !unit.isPlayerControlled()) return;

        const screen = camera.worldToScreen(unit.x, unit.y);

        // Clamp to game-canvas bounds first, then translate to HUD-canvas (page) coords.
        const clampedX = Math.max(0, Math.min(camera.viewportWidth, screen.x));
        const clampedY = Math.max(0, Math.min(camera.viewportHeight, screen.y));
        const sourceX = clampedX + this.canvasPageOffset.x;
        const sourceY = clampedY + this.canvasPageOffset.y;

        const cardTargets = data.abilityId
            ? [this.hudTargets.get(`card:${data.chargeType}:${data.abilityId}`)].filter(Boolean) as { x: number; y: number }[]
            : Array.from(this.hudTargets.entries())
                .filter(([key]) => key.startsWith(`card:${data.chargeType}:`))
                .map(([, pos]) => pos);

        if (cardTargets.length === 0) return;

        const col = iconColor(data.chargeType);
        const soft = iconSoftColor(data.chargeType);
        for (const dest of cardTargets) {
            this.addEffect(new ResourceFlightEffect({
                sourceX,
                sourceY,
                destX: dest.x,
                destY: dest.y,
                color: col,
                softColor: soft,
                particleCount: 2 * data.amount,
                scaleUp: true,
                chargeType: data.chargeType,
            }));
        }
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

        resources.forEach((res, i) => {
            const cardKeyPrefix = `card:${res.chargeType}:`;
            const cardTargets = Array.from(this.hudTargets.entries())
                .filter(([key]) => {
                    if (!key.startsWith(cardKeyPrefix)) return false;
                    const abilityId = key.slice(cardKeyPrefix.length);
                    return res.targetAbilityIds.includes(abilityId);
                })
                .map(([, pos]) => pos);

            // Fallback: fire to canvas bottom center if no matching cards are registered.
            const targets = cardTargets.length > 0
                ? cardTargets
                : [{ x: vw / 2, y: vh + 10 }];

            const sourceX = bannerCenterX - totalW / 2 + i * (ICON_W + ICON_GAP) + ICON_CIRCLE_R;
            const sourceY = bannerCenterY + ICON_BASE_Y + ICON_CIRCLE_R;

            for (const dest of targets) {
                out.push(new ResourceFlightEffect({
                    sourceX,
                    sourceY,
                    destX: dest.x,
                    destY: dest.y,
                    color: res.color,
                    softColor: iconSoftColor(res.chargeType),
                    particleCount: 2 * res.amount,
                    chargeType: res.chargeType,
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
            case 'ResilientText': return this.createResilientText();
            case 'EnrageRings': return this.createEnrageRings(effect);
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
            case 'ResilientText': return this.updateResilientText(visual, effect);
            case 'EnrageRings': return this.updateEnrageRings(visual, effect);
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
                fontSize: 36,
                fontWeight: '800',
                fill: 0xffffff,
                stroke: { color: 0xf59e0b, width: 4 },
                dropShadow: { alpha: 0.7, angle: Math.PI / 2, blur: 10, color: 0x000000, distance: 4 },
            }),
        });
        roundText.anchor.set(0.5, 0.5);
        roundText.y = -28;
        container.addChild(roundText);

        if (data.resources.length > 0) {
            const totalW = iconsTotalWidth(data.resources.length);

            data.resources.forEach((res, i) => {
                const cx = -totalW / 2 + i * (ICON_W + ICON_GAP) + ICON_CIRCLE_R;
                const cy = ICON_BASE_Y + ICON_CIRCLE_R;
                const col = res.color;
                const soft = iconSoftColor(res.chargeType);

                // Large icon circle: soft fill with main-colour border.
                const g = new Graphics();
                g.circle(cx, cy, ICON_CIRCLE_R);
                g.fill({ color: soft, alpha: 0.92 });
                g.circle(cx, cy, ICON_CIRCLE_R);
                g.stroke({ color: col, width: 2, alpha: 1 });
                container.addChild(g);

                // Resource icon drawn large to fill the circle.
                const iconG = new Graphics();
                iconG.x = cx;
                iconG.y = cy;
                this.drawParticleIcon(iconG, res.chargeType, col, ICON_CIRCLE_R);
                container.addChild(iconG);

                // Count badge: small black circle at the bottom of the icon, white number.
                const badgeCy = cy + ICON_CIRCLE_R - BADGE_R * 0.5;
                const badgeG = new Graphics();
                badgeG.circle(cx, badgeCy, BADGE_R);
                badgeG.fill({ color: 0xffffff, alpha: 1 });
                badgeG.circle(cx, badgeCy, BADGE_R);
                badgeG.stroke({ color: 0x000000, width: 1.5, alpha: 1 });
                container.addChild(badgeG);

                const numText = new Text({
                    text: String(res.amount),
                    style: new TextStyle({
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: 14,
                        fontWeight: '800',
                        fill: 0x000000,
                    }),
                });
                numText.anchor.set(0.5, 0.5);
                numText.x = cx;
                numText.y = badgeCy;
                container.addChild(numText);
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
        const r = 12;
        for (let i = 0; i < data.particleCount; i++) {
            const g = new Graphics();
            g.circle(0, 0, r);
            g.fill({ color: data.softColor, alpha: 0.92 });
            g.circle(0, 0, r);
            g.stroke({ color: data.color, width: 1.5, alpha: 1 });
            if (data.chargeType) this.drawParticleIcon(g, data.chargeType, data.color, r);
            container.addChild(g);
        }
        return container;
    }

    private drawParticleIcon(g: Graphics, chargeType: string, color: number, r: number): void {
        const s = r * 0.52;
        switch (chargeType) {
            case 'staminaCharge':
            case 'energyCharge':
                // Lightning bolt — zigzag stroke
                g.moveTo(s * 0.35, -s);
                g.lineTo(-s * 0.15, 0);
                g.lineTo(s * 0.2, 0);
                g.lineTo(-s * 0.35, s);
                g.stroke({ color, width: r * 0.15, alpha: 1 });
                break;
            case 'lightCharge': {
                // Small filled center + 4 diagonal rays (sun)
                const inner = s * 0.35;
                const outer = s * 0.9;
                g.circle(0, 0, inner);
                g.fill({ color, alpha: 1 });
                for (let i = 0; i < 4; i++) {
                    const angle = i * (Math.PI / 2) + Math.PI / 4;
                    g.moveTo(Math.cos(angle) * (inner + 1), Math.sin(angle) * (inner + 1));
                    g.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
                }
                g.stroke({ color, width: r * 0.13, alpha: 1 });
                break;
            }
            case 'roundCharge':
                // Clock face — ring + two hands
                g.circle(0, 0, s * 0.85);
                g.stroke({ color, width: r * 0.13, alpha: 1 });
                g.moveTo(0, 0);
                g.lineTo(0, -s * 0.6);
                g.moveTo(0, 0);
                g.lineTo(s * 0.5, 0);
                g.stroke({ color, width: r * 0.11, alpha: 1 });
                break;
            default:
                break;
        }
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

            // Pop-out scale: 0→1 in first 15% of flight, then hold at 1.
            const scale = data.scaleUp ? Math.min(1, localT / 0.15) : 1;
            g.scale.set(scale);
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

    // ─── ResilientText ───────────────────────────────────────────────────────

    private onBossExposedCcSuppressed(data: BossExposedCcSuppressedEvent): void {
        const engine = this.engineSource;
        const camera = this.camera;
        if (!engine || !camera) return;

        const unit = engine.getUnit(data.unitId);
        if (!unit) return;

        const screen = camera.worldToScreen(unit.x, unit.y);
        const clampedX = Math.max(0, Math.min(camera.viewportWidth, screen.x));
        const clampedY = Math.max(0, Math.min(camera.viewportHeight, screen.y));
        const sourceX = clampedX + this.canvasPageOffset.x;
        const sourceY = clampedY + this.canvasPageOffset.y;

        const dest = this.hudTargets.get('boss:cc_status');
        if (!dest) return;

        this.addEffect(new ResilientTextEffect(sourceX, sourceY, dest.x, dest.y));
    }

    private createResilientText(): Text {
        const t = new Text({
            text: 'Resilient',
            style: new TextStyle({
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: 18,
                fontWeight: '800',
                fill: 0xf59e0b,
                stroke: { color: 0x1c0a00, width: 3 },
                dropShadow: { alpha: 0.7, angle: Math.PI / 2, blur: 6, color: 0x000000, distance: 2 },
            }),
        });
        t.anchor.set(0.5, 0.5);
        return t;
    }

    private updateResilientText(visual: Container, effect: HudEffect): void {
        const data = effect.effectData as ResilientTextData;
        const p = effect.progress;

        // Position: ease-out cubic from source to dest
        const t = 1 - Math.pow(1 - p, 3);
        visual.x = data.sourceX + (data.destX - data.sourceX) * t;
        visual.y = data.sourceY + (data.destY - data.sourceY) * t;

        // Scale: quick pop-in 0.8→1.15 over first 12%, then shrink 1.15→0.25
        if (p < 0.12) {
            visual.scale.set(0.8 + 0.35 * (p / 0.12));
        } else {
            visual.scale.set(1.15 - 0.9 * ((p - 0.12) / 0.88));
        }

        // Alpha: full until 65%, then linear fade to 0
        visual.alpha = p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35);
    }

    // ─── EnrageRings ─────────────────────────────────────────────────────────

    private onUnitEnraged(data: UnitEnragedEvent): void {
        const engine = this.engineSource;
        const camera = this.camera;
        if (!engine || !camera) return;
        const unit = engine.getUnit(data.unitId);
        if (!unit) return;
        const screen = camera.worldToScreen(unit.x, unit.y);
        const screenRadius = unit.radius * camera.zoom;
        this.addEffect(new EnrageRingsEffect(screen.x, screen.y, screenRadius));
    }

    private createEnrageRings(effect: HudEffect): Container {
        const data = effect.effectData as EnrageRingsData;
        const container = new Container();
        for (let i = 0; i < data.rings.length; i++) {
            container.addChild(new Graphics());
        }
        return container;
    }

    private updateEnrageRings(visual: Container, effect: HudEffect): void {
        const data = effect.effectData as EnrageRingsData;
        const elapsed = effect.elapsed;
        const RING_DURATION = 0.2;
        for (let i = 0; i < data.rings.length; i++) {
            const g = visual.children[i] as Graphics;
            const ring = data.rings[i]!;
            const localElapsed = elapsed - ring.spawnTime;
            if (localElapsed <= 0 || localElapsed >= RING_DURATION) {
                g.visible = false;
                continue;
            }
            const t = localElapsed / RING_DURATION;
            const radius = 2 + 18 * t;
            const alpha = 1 - t;
            g.visible = true;
            g.x = data.bossScreenX + ring.offsetX;
            g.y = data.bossScreenY + ring.offsetY;
            g.clear();
            g.circle(0, 0, radius);
            g.stroke({ color: 0xff2222, width: 1.5, alpha });
        }
    }
}
