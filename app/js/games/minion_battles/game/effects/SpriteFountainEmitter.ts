/**
 * SpriteFountainEmitter — streams named SpriteEffects out of a point for a fixed window.
 *
 * Each particle picks an angle around `centerAngle` (biased toward it by `angleBiasExponent`),
 * is launched with that angle's *horizontal* component only, plus a small random vertical kick.
 * Horizontal speed is damped (`dampingKx`) while `ay` builds vertical speed (`dampingKy`, default 0),
 * so particles fan out, stall sideways and rise — with an upward centre that reads as a flame.
 *
 * Deterministic: all randomness comes from engine.generateRandomNumber() during the game tick.
 */

import { EffectEmitter } from './EffectEmitter';
import { Effect } from './Effect';
import type { EngineContext } from '../EngineContext';
import { SPRITE_EFFECT_DEFS } from '../effect_defs/spriteEffectDefs';

export interface SpriteFountainConfig {
    /** Key into SPRITE_EFFECT_DEFS; particle lifetime is that def's duration. */
    spriteEffectId: string;
    /** Particles spawned per game-second. */
    ratePerSecond: number;
    /** Seconds the fountain emits for. */
    emitSeconds: number;
    /** Seconds before the first particle. Default 0. */
    startDelay?: number;
    /** Launch direction (radians). Default -π/2 (straight up). */
    centerAngle?: number;
    /** Max deviation from centerAngle (radians). Default π (any direction). */
    angleSpread?: number;
    /** >1 biases angles toward centerAngle (offset = spread·u^exp). Default 2. */
    angleBiasExponent?: number;
    /** Horizontal launch speed range (px/s), scaled by |cos(angle)|. */
    speedMin: number;
    speedMax: number;
    /** Random vertical launch speed range (px/s, negative = up). Default [-20, 0]. */
    vyMin?: number;
    vyMax?: number;
    /** Distance from the origin (along the launch angle) particles spawn at. Default 0. */
    spawnRadius?: number;
    /** Vertical acceleration (px/s², negative = up). Default -160. */
    ay?: number;
    /** Horizontal damping (1/s). Default 3. */
    dampingKx?: number;
    /** Vertical damping (1/s). Default 0 (vertical speed keeps building). */
    dampingKy?: number;
}

export class SpriteFountainEmitter extends EffectEmitter {
    readonly config: SpriteFountainConfig;
    private remainder = 0;

    constructor(init: { id?: string; x: number; y: number; config: SpriteFountainConfig; elapsed?: number; remainder?: number }) {
        super({ id: init.id, x: init.x, y: init.y, lifetime: (init.config.startDelay ?? 0) + init.config.emitSeconds });
        this.config = init.config;
        if (init.elapsed != null) this.elapsed = init.elapsed;
        if (init.remainder != null) this.remainder = init.remainder;
    }

    update(dt: number, engine: EngineContext): Effect[] {
        this.elapsed += dt;
        const c = this.config;
        const produced: Effect[] = [];
        const def = SPRITE_EFFECT_DEFS[c.spriteEffectId];
        if (def && this.elapsed > (c.startDelay ?? 0)) {
            const rand = () => engine.generateRandomNumber() / 0x7fffffff;
            const total = c.ratePerSecond * dt + this.remainder;
            const spawnCount = Math.floor(total);
            this.remainder = total - spawnCount;
            const center = c.centerAngle ?? -Math.PI / 2;
            const spread = c.angleSpread ?? Math.PI;
            const biasExp = c.angleBiasExponent ?? 2;
            const vyMin = c.vyMin ?? -20;
            const vyMax = c.vyMax ?? 0;
            const spawnRadius = c.spawnRadius ?? 0;
            for (let i = 0; i < spawnCount; i++) {
                const u = rand() * 2 - 1;
                const angle = center + Math.sign(u) * Math.pow(Math.abs(u), biasExp) * spread;
                const dirX = Math.cos(angle);
                const dirY = Math.sin(angle);
                const speed = c.speedMin + rand() * (c.speedMax - c.speedMin);
                produced.push(new Effect({
                    x: this.x + dirX * spawnRadius,
                    y: this.y + dirY * spawnRadius,
                    duration: def.duration,
                    effectType: 'SpriteEffect',
                    effectData: {
                        defId: c.spriteEffectId,
                        vx: dirX * speed,
                        vy: vyMin + rand() * (vyMax - vyMin),
                        ay: c.ay ?? -160,
                        dampingKx: c.dampingKx ?? 3,
                        dampingKy: c.dampingKy ?? 0,
                    },
                }));
            }
        }
        if (this.elapsed >= this.lifetime) this.active = false;
        return produced;
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'SpriteFountainEmitter',
            id: this.id,
            x: this.x,
            y: this.y,
            elapsed: this.elapsed,
            remainder: this.remainder,
            config: this.config,
        };
    }

    restoreFromJSON(d: Record<string, unknown>): void {
        this.elapsed = (d.elapsed as number) ?? 0;
        this.remainder = (d.remainder as number) ?? 0;
    }
}
