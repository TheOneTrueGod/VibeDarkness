/**
 * GravityLocusFieldBuff — a deployed Gravity Locus field, carried by the caster.
 *
 * The Gravity Locus cast itself is short (~1s); this buff keeps the field alive at
 * the locus for GRAVITY_LOCUS_FIELD_DURATION seconds, pulsing non-interrupting
 * nudges on enemies inside the field radius and re-emitting the field visual each
 * game tick. Serialized with the unit so the field survives checkpoint restore.
 *
 * Field damage: when `fieldDamage` is set, enemies inside the field take `perTick` damage on
 * every few pulses, spaced so `total` lands within the buff's duration (see
 * `getSpreadDamageForPulse`). The schedule is derived from elapsed time, so it survives
 * checkpoint restore without extra counters.
 *
 * Repulse upgrade: when `repulse` is set (Gravity Locus research modifier), the field
 * radius starts small and expands outward over the (shortened) buff duration — a
 * widening ring — then detonates on expiry via `onBeforeExpire`, damaging and knocking
 * back enemies still caught inside the original field radius.
 */

import { Buff, type BuffExpireContext, type BuffSerialized } from './Buff';
import type { BuffRenderEmitContext } from '../game/effects/buffParticleAura';
import type { Unit } from '../game/units/Unit';
import type { KnockbackSource } from '../game/units/unitTypes';
import type { EngineContext } from '../game/EngineContext';
import { Effect } from '../game/effects/Effect';
import { areEnemies } from '../game/teams';
import { applyNudgeToUnit, clampNudgeVectorToTerrain } from '../game/units/unitNudge';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../crowdControl/knockbackKeywords';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_LOCUS_ABILITY_ID,
    GRAVITY_LOCUS_FIELD_ALPHA,
    GRAVITY_LOCUS_FIELD_DURATION,
    GRAVITY_LOCUS_FIELD_RADIUS,
    GRAVITY_LOCUS_NUDGE_DISTANCE,
    GRAVITY_LOCUS_NUDGE_DURATION,
    GRAVITY_LOCUS_PULSE_INTERVAL,
    GRAVITY_LOCUS_REPULSE_MIN_RADIUS_FRACTION,
} from '../card_defs/09_gravity_core/gravityConstants';
import {
    GRAVITY_FIELD_EFFECT_TYPE,
    GRAVITY_VIOLET,
} from '../game/effect_defs/aoeEffects';
import { NUDGE_ARROW_EFFECT_TYPE } from '../game/effect_defs/movementEffects';

export const GRAVITY_LOCUS_FIELD_BUFF_TYPE = 'gravity_locus_field';

/** Damage spread across the field's pulses: `total` damage in `perTick` increments. */
export interface FieldPulseDamageConfig {
    total: number;
    perTick: number;
}

/**
 * Damage to deal on 1-based pulse `pulseIndex` of `totalPulses` so that `config.total` lands in
 * `config.perTick` increments across the pulses. Ticks start on pulse 1 and are evenly spaced;
 * when they don't divide the pulses evenly, the final tick lands before the final pulse.
 */
export function getSpreadDamageForPulse(
    config: FieldPulseDamageConfig,
    pulseIndex: number,
    totalPulses: number,
): number {
    if (config.perTick <= 0 || totalPulses <= 0) return 0;
    if (pulseIndex < 1 || pulseIndex > totalPulses) return 0;
    const ticks = Math.round(config.total / config.perTick);
    const ticksBy = (n: number) => Math.min(ticks, Math.ceil((n * ticks) / totalPulses - 1e-9));
    return (ticksBy(pulseIndex) - ticksBy(pulseIndex - 1)) * config.perTick;
}

/** Repulse upgrade parameters — set when Gravity Locus research grants the detonation. */
export interface GravityLocusRepulseConfig {
    explosionDamage: number;
    knockbackTier: number;
}

interface GravityLocusFieldBuffSerialized extends BuffSerialized {
    locusX: number;
    locusY: number;
    mode: string;
    repulseExplosionDamage?: number;
    repulseKnockbackTier?: number;
    fieldDamageTotal?: number;
    fieldDamagePerTick?: number;
}

/** Wall seconds between field visual effects (one per frame at 60 fps, as when it was emitted per tick). */
const FIELD_VISUAL_INTERVAL_SEC = 1 / 60;

export class GravityLocusFieldBuff extends Buff {
    readonly _type = GRAVITY_LOCUS_FIELD_BUFF_TYPE;

    readonly locusX: number;
    readonly locusY: number;
    /** Gravity Ability Mode ('push' | 'pull'). */
    readonly mode: string;
    /** Set when the Repulse research modifier is active on this cast. */
    readonly repulse?: GravityLocusRepulseConfig;
    /** Damage the field deals to enemies inside it, spread across its pulses. */
    readonly fieldDamage?: FieldPulseDamageConfig;

    constructor(
        locus: { x: number; y: number },
        mode: string,
        durationSeconds: number = GRAVITY_LOCUS_FIELD_DURATION,
        repulse?: GravityLocusRepulseConfig,
        fieldDamage?: FieldPulseDamageConfig,
    ) {
        super({ value: durationSeconds, unit: 'seconds' });
        this.locusX = locus.x;
        this.locusY = locus.y;
        this.mode = mode;
        this.repulse = repulse;
        this.fieldDamage = fieldDamage;
    }

    /** Number of pulses the field fires over its full duration. */
    private getTotalPulses(): number {
        return Math.max(1, Math.floor(this.duration.value / GRAVITY_LOCUS_PULSE_INTERVAL + 1e-9));
    }

    /** Current field radius — fixed unless Repulse is expanding it toward detonation. */
    private getFieldRadius(gameTime: number): number {
        if (!this.repulse) return GRAVITY_LOCUS_FIELD_RADIUS;
        const progress = this.duration.value > 0
            ? Math.min(1, (gameTime - this.appliedAtTime) / this.duration.value)
            : 1;
        const minRadius = GRAVITY_LOCUS_FIELD_RADIUS * GRAVITY_LOCUS_REPULSE_MIN_RADIUS_FRACTION;
        return minRadius + (GRAVITY_LOCUS_FIELD_RADIUS - minRadius) * progress;
    }

    /** Transient render cadence for the field visual (not serialized). */
    private fieldVisualAccum = 0;

    /**
     * Field visual: one short-lived effect every 1/60 s of wall time, emitted from the render loop so the field
     * keeps animating at a pause plane. Reconnect-safe: driven by the buff's serialized state.
     */
    override renderEmit(_unit: Unit, ctx: BuffRenderEmitContext): void {
        this.fieldVisualAccum += ctx.realDt;
        const radius = this.getFieldRadius(ctx.gameTime);
        let n = 0;
        while (this.fieldVisualAccum >= FIELD_VISUAL_INTERVAL_SEC && n < 4) {
            this.fieldVisualAccum -= FIELD_VISUAL_INTERVAL_SEC;
            n++;
            ctx.emit(new Effect({
                x: this.locusX,
                y: this.locusY,
                duration: 1,
                effectType: GRAVITY_FIELD_EFFECT_TYPE,
                pauseBehaviour: 'continue',
                effectData: {
                    color: GRAVITY_VIOLET,
                    radius,
                    alpha: GRAVITY_LOCUS_FIELD_ALPHA,
                    direction: this.mode === GRAVITY_ABILITY_MODE_PULL ? 'in' : 'out',
                },
            }));
        }
        if (this.fieldVisualAccum >= FIELD_VISUAL_INTERVAL_SEC) this.fieldVisualAccum %= FIELD_VISUAL_INTERVAL_SEC;
    }

    override onGameTick(unit: Unit, engine: EngineContext, dt: number): void {
        if (!unit.isAlive()) return;

        const radius = this.getFieldRadius(engine.gameTime);

        const elapsed = engine.gameTime - this.appliedAtTime;
        const prevElapsed = Math.max(0, elapsed - dt);
        const firstPulse = Math.floor(prevElapsed / GRAVITY_LOCUS_PULSE_INTERVAL) + 1;
        const lastPulse = Math.floor(elapsed / GRAVITY_LOCUS_PULSE_INTERVAL);
        const totalPulses = this.getTotalPulses();
        for (let pulseIndex = firstPulse; pulseIndex <= lastPulse; pulseIndex++) {
            const damage = this.fieldDamage
                ? getSpreadDamageForPulse(this.fieldDamage, pulseIndex, totalPulses)
                : 0;
            this.applyPulse(unit, engine, radius, damage);
        }
    }

    private applyPulse(caster: Unit, engine: EngineContext, radius: number, damage: number): void {
        const radiusSq = radius * radius;

        for (const target of engine.units) {
            if (!target.isAlive()) continue;
            if (!areEnemies(caster.teamId, target.teamId)) continue;

            const dx = target.x - this.locusX;
            const dy = target.y - this.locusY;
            const distSq = dx * dx + dy * dy;
            if (distSq > radiusSq) continue;

            if (damage > 0) {
                target.takeDamage(damage, caster.id, engine.eventBus);
                if (!target.isAlive()) continue;
            }

            const dist = Math.sqrt(distSq);
            let nudgeX: number;
            let nudgeY: number;

            if (this.mode === GRAVITY_ABILITY_MODE_PULL) {
                if (dist < 1e-3) continue;
                const pullDist = Math.min(GRAVITY_LOCUS_NUDGE_DISTANCE, dist);
                nudgeX = -(dx / dist) * pullDist;
                nudgeY = -(dy / dist) * pullDist;
            } else {
                if (dist < 1e-3) {
                    nudgeX = GRAVITY_LOCUS_NUDGE_DISTANCE;
                    nudgeY = 0;
                } else {
                    nudgeX = (dx / dist) * GRAVITY_LOCUS_NUDGE_DISTANCE;
                    nudgeY = (dy / dist) * GRAVITY_LOCUS_NUDGE_DISTANCE;
                }
            }

            const clamped = clampNudgeVectorToTerrain(
                target,
                { x: nudgeX, y: nudgeY },
                engine.terrainManager,
                engine.terrainManager?.grid ?? null,
            );
            if (Math.hypot(clamped.x, clamped.y) < 0.5) continue;

            applyNudgeToUnit(
                target,
                clamped,
                GRAVITY_LOCUS_NUDGE_DURATION,
            );

            const angle = Math.atan2(clamped.y, clamped.x);
            engine.addEffect(new Effect({
                x: target.x,
                y: target.y,
                duration: GRAVITY_LOCUS_NUDGE_DURATION,
                effectType: NUDGE_ARROW_EFFECT_TYPE,
                effectData: { direction: angle, color: GRAVITY_VIOLET },
            }));
        }
    }

    /** Repulse detonation: damage + knockback for every enemy still inside the original field radius. */
    override onBeforeExpire(unit: Unit, ctx: BuffExpireContext): void {
        if (!this.repulse || !unit.isAlive()) return;

        const radiusSq = GRAVITY_LOCUS_FIELD_RADIUS * GRAVITY_LOCUS_FIELD_RADIUS;
        const source: KnockbackSource = { unitId: unit.id, abilityId: GRAVITY_LOCUS_ABILITY_ID };
        const knockbackEngine = knockbackCtxFromEngine({
            gameTime: ctx.gameTime,
            roundNumber: ctx.roundNumber,
            eventBus: ctx.eventBus,
            interruptUnitAndRefundAbilities: ctx.interruptUnitAndRefundAbilities,
        });

        for (const target of ctx.units ?? []) {
            if (!target.isAlive()) continue;
            if (!areEnemies(unit.teamId, target.teamId)) continue;

            const dx = target.x - this.locusX;
            const dy = target.y - this.locusY;
            if (dx * dx + dy * dy > radiusSq) continue;

            // Flat explosion damage; return value unused, so no need for the shield/armour breakdown.
            target.takeDamage(this.repulse.explosionDamage, unit.id, ctx.eventBus);
            tryApplyKnockbackByTier(
                target,
                this.repulse.knockbackTier,
                source,
                this.locusX,
                this.locusY,
                knockbackEngine,
            );
        }

        ctx.addEffect?.(new Effect({
            x: this.locusX,
            y: this.locusY,
            duration: 0.45,
            effectType: 'Explosion',
            effectProperties: {
                color: GRAVITY_VIOLET,
                direction: 'expand',
                shape: 'ring',
                radius: GRAVITY_LOCUS_FIELD_RADIUS,
            },
        }));
    }

    override toJSON(): GravityLocusFieldBuffSerialized {
        return {
            ...super.toJSON(),
            locusX: this.locusX,
            locusY: this.locusY,
            mode: this.mode,
            repulseExplosionDamage: this.repulse?.explosionDamage,
            repulseKnockbackTier: this.repulse?.knockbackTier,
            fieldDamageTotal: this.fieldDamage?.total,
            fieldDamagePerTick: this.fieldDamage?.perTick,
        };
    }

    static fromSerialized(data: BuffSerialized): GravityLocusFieldBuff {
        const d = data as GravityLocusFieldBuffSerialized;
        const repulse: GravityLocusRepulseConfig | undefined =
            d.repulseExplosionDamage !== undefined && d.repulseKnockbackTier !== undefined
                ? { explosionDamage: d.repulseExplosionDamage, knockbackTier: d.repulseKnockbackTier }
                : undefined;
        const fieldDamage: FieldPulseDamageConfig | undefined =
            d.fieldDamageTotal !== undefined && d.fieldDamagePerTick !== undefined
                ? { total: d.fieldDamageTotal, perTick: d.fieldDamagePerTick }
                : undefined;
        const buff = new GravityLocusFieldBuff(
            { x: d.locusX, y: d.locusY },
            d.mode,
            data.durationValue,
            repulse,
            fieldDamage,
        );
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
