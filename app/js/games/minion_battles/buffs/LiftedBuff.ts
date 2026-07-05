/**
 * LiftedBuff — suspended airborne hard CC. Unit cannot move or act for the duration;
 * on expiry applies terrain-aware horizontal slam displacement, damage, and a slam event.
 */

import { Buff, type BuffExpireContext, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import { computeForcedDisplacement } from '../game/forceMove';

export const LIFTED_BUFF_TYPE = 'lifted';

/** Vertical lift cap for UnitRenderer (pixels). */
export const LIFTED_RENDER_MAX_HEIGHT_PX = 25;

/** Unit radius multiplier for render lift height. */
export const LIFTED_RENDER_HEIGHT_RADIUS_FACTOR = 0.75;

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
