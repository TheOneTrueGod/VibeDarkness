/**
 * GravityLocusFieldBuff — a deployed Gravity Locus field, carried by the caster.
 *
 * The Gravity Locus cast itself is short (~1s); this buff keeps the field alive at
 * the locus for GRAVITY_LOCUS_FIELD_DURATION seconds, pulsing non-interrupting
 * nudges on enemies inside the field radius and re-emitting the field visual each
 * game tick. Serialized with the unit so the field survives checkpoint restore.
 */

import { Buff, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { Effect } from '../game/effects/Effect';
import { areEnemies } from '../game/teams';
import { applyNudgeToUnit, clampNudgeVectorToTerrain } from '../game/units/unitNudge';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_LOCUS_FIELD_ALPHA,
    GRAVITY_LOCUS_FIELD_DURATION,
    GRAVITY_LOCUS_FIELD_RADIUS,
    GRAVITY_LOCUS_NUDGE_DISTANCE,
    GRAVITY_LOCUS_NUDGE_DURATION,
    GRAVITY_LOCUS_PULSE_INTERVAL,
} from '../card_defs/09_gravity_core/gravityConstants';
import {
    GRAVITY_FIELD_EFFECT_TYPE,
    GRAVITY_VIOLET,
} from '../game/effect_defs/aoeEffects';
import { NUDGE_ARROW_EFFECT_TYPE } from '../game/effect_defs/movementEffects';

export const GRAVITY_LOCUS_FIELD_BUFF_TYPE = 'gravity_locus_field';

interface GravityLocusFieldBuffSerialized extends BuffSerialized {
    locusX: number;
    locusY: number;
    mode: string;
}

export class GravityLocusFieldBuff extends Buff {
    readonly _type = GRAVITY_LOCUS_FIELD_BUFF_TYPE;

    readonly locusX: number;
    readonly locusY: number;
    /** Gravity Ability Mode ('push' | 'pull'). */
    readonly mode: string;

    constructor(
        locus: { x: number; y: number },
        mode: string,
        durationSeconds: number = GRAVITY_LOCUS_FIELD_DURATION,
    ) {
        super({ value: durationSeconds, unit: 'seconds' });
        this.locusX = locus.x;
        this.locusY = locus.y;
        this.mode = mode;
    }

    override onGameTick(unit: Unit, engine: EngineContext, dt: number): void {
        if (!unit.isAlive()) return;

        // Field visual: one short-lived effect per tick, matching the old
        // continuous-emitter look but reconnect-safe (driven by serialized state).
        engine.addEffect(new Effect({
            x: this.locusX,
            y: this.locusY,
            duration: 1,
            effectType: GRAVITY_FIELD_EFFECT_TYPE,
            effectData: {
                color: GRAVITY_VIOLET,
                radius: GRAVITY_LOCUS_FIELD_RADIUS,
                alpha: GRAVITY_LOCUS_FIELD_ALPHA,
                direction: this.mode === GRAVITY_ABILITY_MODE_PULL ? 'in' : 'out',
            },
        }));

        const elapsed = engine.gameTime - this.appliedAtTime;
        const prevElapsed = Math.max(0, elapsed - dt);
        const pulses =
            Math.floor(elapsed / GRAVITY_LOCUS_PULSE_INTERVAL) -
            Math.floor(prevElapsed / GRAVITY_LOCUS_PULSE_INTERVAL);
        for (let p = 0; p < pulses; p++) {
            this.applyPulse(unit, engine);
        }
    }

    private applyPulse(caster: Unit, engine: EngineContext): void {
        const radiusSq = GRAVITY_LOCUS_FIELD_RADIUS * GRAVITY_LOCUS_FIELD_RADIUS;

        for (const target of engine.units) {
            if (!target.isAlive()) continue;
            if (!areEnemies(caster.teamId, target.teamId)) continue;

            const dx = target.x - this.locusX;
            const dy = target.y - this.locusY;
            const distSq = dx * dx + dy * dy;
            if (distSq > radiusSq) continue;

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

    override toJSON(): GravityLocusFieldBuffSerialized {
        return {
            ...super.toJSON(),
            locusX: this.locusX,
            locusY: this.locusY,
            mode: this.mode,
        };
    }

    static fromSerialized(data: BuffSerialized): GravityLocusFieldBuff {
        const d = data as GravityLocusFieldBuffSerialized;
        const buff = new GravityLocusFieldBuff(
            { x: d.locusX, y: d.locusY },
            d.mode,
            data.durationValue,
        );
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
