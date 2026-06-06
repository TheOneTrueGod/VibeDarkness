import { HudEffect } from '../effects/HudEffect';

// ─── RoundStartBanner ──────────────────────────────────────────────────────────
// Centered banner: "Round N" + "Stamina Restored". Only shown from round 2+.
// Animation: pop-in (0–20%), hold (20–80%), float-up + fade (80–100%).

export class RoundStartBannerEffect extends HudEffect {
    declare effectData: { roundNumber: number };

    constructor(roundNumber: number) {
        super('RoundStartBanner', 2.0);
        this.effectData = { roundNumber };
    }
}

// ─── ScreenFlash ──────────────────────────────────────────────────────────────
// Full-viewport color flash. Alpha rises then falls over duration.
// Generic utility: crits, knockouts, round transitions.

export class ScreenFlashEffect extends HudEffect {
    declare effectData: { color: number; maxAlpha: number };

    constructor(color = 0xffffff, maxAlpha = 0.45) {
        super('ScreenFlash', 0.5);
        this.effectData = { color, maxAlpha };
    }
}

// ─── TeamworkText ─────────────────────────────────────────────────────────────
// Gold "Teamwork" text. Migrated from TurnIndicator.tsx CSS animation.
// Bounce in over first 12%, then fade + drift up over remaining 88%.

export class TeamworkTextEffect extends HudEffect {
    constructor() {
        super('TeamworkText', 1.1);
    }
}

// ─── ResourceFlight ───────────────────────────────────────────────────────────
// Stream of particles arcing from source to destination (screen coords).
// Particles clamp to canvas bounds if dest is outside canvas area.

export type ResourceFlightParticle = {
    cx1: number;
    cy1: number;
    cx2: number;
    cy2: number;
    phaseOffset: number; // 0..0.2 stagger so they stream rather than burst
};

export type ResourceFlightData = {
    sourceX: number;
    sourceY: number;
    destX: number;
    destY: number;
    color: number;
    particleCount: number;
    particles: ResourceFlightParticle[];
};

export class ResourceFlightEffect extends HudEffect {
    declare effectData: ResourceFlightData;

    constructor(config: {
        sourceX: number;
        sourceY: number;
        destX: number;
        destY: number;
        color?: number;
        particleCount?: number;
    }) {
        super('ResourceFlight', 0.8);
        const count = config.particleCount ?? 6;
        const particles: ResourceFlightParticle[] = [];
        for (let i = 0; i < count; i++) {
            // eslint-disable-next-line no-restricted-syntax
            const jitter = () => (Math.random() - 0.5) * 60;
            const midX = (config.sourceX + config.destX) / 2;
            const midY = (config.sourceY + config.destY) / 2;
            particles.push({
                cx1: midX + jitter(),
                cy1: midY + jitter(),
                cx2: midX + jitter(),
                cy2: midY + jitter(),
                phaseOffset: (i / count) * 0.2,
            });
        }
        this.effectData = {
            sourceX: config.sourceX,
            sourceY: config.sourceY,
            destX: config.destX,
            destY: config.destY,
            color: config.color ?? 0x7c3aed,
            particleCount: count,
            particles,
        };
    }
}

// ─── ResourceArrivalPulse ─────────────────────────────────────────────────────
// Expanding ring at the destination when a ResourceFlight completes.
// Spawned automatically by HudEffectLayer; can also be triggered directly.

export type ResourceArrivalPulseData = { x: number; y: number; color: number };

export class ResourceArrivalPulseEffect extends HudEffect {
    declare effectData: ResourceArrivalPulseData;

    constructor(x: number, y: number, color: number) {
        super('ResourceArrivalPulse', 0.4);
        this.effectData = { x, y, color };
    }
}
