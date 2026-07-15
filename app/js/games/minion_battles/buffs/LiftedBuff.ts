/**
 * LiftedBuff — suspended airborne hard CC. Unit cannot move or act for the duration;
 * on expiry applies terrain-aware horizontal slam displacement, damage, and a slam event.
 */

import { Buff, type BuffExpireContext, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import { computeForcedDisplacement } from '../game/forceMove';

export const LIFTED_BUFF_TYPE = 'lifted';

/** Vertical lift cap for UnitRenderer (pixels). */
export const LIFTED_RENDER_MAX_HEIGHT_PX = 50;

/** Unit radius multiplier for render lift height. */
export const LIFTED_RENDER_HEIGHT_RADIUS_FACTOR = 1.5;

export function getLiftedMaxRenderHeightPx(unitRadius: number): number {
    return Math.min(
        unitRadius * LIFTED_RENDER_HEIGHT_RADIUS_FACTOR,
        LIFTED_RENDER_MAX_HEIGHT_PX,
    );
}

/** Lift progress 0→1 over the buff duration; render height ramps linearly to max. */
export function getLiftedRenderProgress(buffAppliedAtTime: number, buffDurationSec: number, gameTime: number): number {
    if (buffDurationSec <= 0) return 1;
    const elapsed = gameTime - buffAppliedAtTime;
    return Math.min(1, Math.max(0, elapsed / buffDurationSec));
}

export interface LiftedRenderState {
    yOffset: number;
    maxHeight: number;
}

/** Current airborne offset for a lifted unit, or null when not lifted. */
export function getLiftedRenderState(unit: Unit, gameTime: number): LiftedRenderState | null {
    const buff = unit.buffs.find((b) => b._type === LIFTED_BUFF_TYPE);
    if (!buff || buff.duration.unit !== 'seconds') return null;

    const maxHeight = getLiftedMaxRenderHeightPx(unit.radius);
    const progress = getLiftedRenderProgress(buff.appliedAtTime, buff.duration.value, gameTime);
    return { yOffset: -maxHeight * progress, maxHeight };
}

export interface LiftSlamParams {
    slamDamage: number;
    horizontalTarget?: { x: number; y: number };
    sourceAbilityId: string;
}

interface LiftedBuffSerialized extends BuffSerialized {
    slamDamage: number;
    horizontalTarget?: { x: number; y: number };
    sourceAbilityId: string;
    sourceUnitId: string;
}

export class LiftedBuff extends Buff {
    readonly _type = LIFTED_BUFF_TYPE;

    readonly slamDamage: number;
    readonly horizontalTarget?: { x: number; y: number };
    readonly sourceAbilityId: string;
    readonly sourceUnitId: string;

    constructor(durationSeconds: number, slamParams: LiftSlamParams, sourceUnitId: string) {
        super({ value: durationSeconds, unit: 'seconds' });
        this.slamDamage = slamParams.slamDamage;
        this.horizontalTarget = slamParams.horizontalTarget;
        this.sourceAbilityId = slamParams.sourceAbilityId;
        this.sourceUnitId = sourceUnitId;
    }

    override onBeforeExpire(unit: Unit, ctx: BuffExpireContext): void {
        if (this.horizontalTarget) {
            const tm = ctx.terrainManager;
            const grid = tm?.grid ?? null;
            const towardX = this.horizontalTarget.x;
            const towardY = this.horizontalTarget.y;
            const dxTotal = towardX - unit.x;
            const dyTotal = towardY - unit.y;
            const maxDistance = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal);
            const disp = computeForcedDisplacement(unit.x, unit.y, towardX, towardY, maxDistance, {
                terrainManager: tm,
                grid,
            });
            unit.x += disp.dx;
            unit.y += disp.dy;
        }

        // Flat slam damage; return value unused, so no need for the shield/armour breakdown.
        unit.takeDamage(this.slamDamage, this.sourceUnitId, ctx.eventBus);

        ctx.eventBus.emit('unit_slam_landed', {
            unitId: unit.id,
            position: { x: unit.x, y: unit.y },
            sourceAbilityId: this.sourceAbilityId,
        });
    }

    override toJSON(): LiftedBuffSerialized {
        return {
            ...super.toJSON(),
            slamDamage: this.slamDamage,
            horizontalTarget: this.horizontalTarget,
            sourceAbilityId: this.sourceAbilityId,
            sourceUnitId: this.sourceUnitId,
        };
    }

    static fromSerialized(data: BuffSerialized): LiftedBuff {
        const d = data as LiftedBuffSerialized;
        const buff = new LiftedBuff(
            data.durationValue,
            {
                slamDamage: d.slamDamage,
                horizontalTarget: d.horizontalTarget,
                sourceAbilityId: d.sourceAbilityId,
            },
            d.sourceUnitId,
        );
        buff.appliedAtTime = data.appliedAtTime ?? 0;
        buff.appliedAtRound = data.appliedAtRound ?? 1;
        return buff;
    }
}
