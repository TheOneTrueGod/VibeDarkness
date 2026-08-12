/**
 * LiftedBuff — suspended airborne hard CC. Unit cannot move or act for the duration;
 * on expiry applies terrain-aware horizontal slam displacement, damage, slam AoE knockback,
 * and a slam event.
 */

import { Buff, type BuffExpireContext, type BuffSerialized } from './Buff';
import type { Unit } from '../game/units/Unit';
import { computeForcedDisplacement } from '../game/forceMove';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../crowdControl/knockbackKeywords';

export const LIFTED_BUFF_TYPE = 'lifted';

/** Base vertical lift cap before the +50% height stretch (UnitRenderer pixels). */
const LIFTED_RENDER_MAX_HEIGHT_BASE_PX = 50;
/** Vertical lift cap for UnitRenderer (pixels). */
export const LIFTED_RENDER_MAX_HEIGHT_PX = LIFTED_RENDER_MAX_HEIGHT_BASE_PX * 1.5;

/** Base unit-radius multiplier before the +50% height stretch. */
const LIFTED_RENDER_HEIGHT_RADIUS_FACTOR_BASE = 1.5;
/** Unit radius multiplier for render lift height. */
export const LIFTED_RENDER_HEIGHT_RADIUS_FACTOR = LIFTED_RENDER_HEIGHT_RADIUS_FACTOR_BASE * 1.5;

/** Knockback tier applied to nearby units when a lifted unit slams down. */
export const LIFTED_SLAM_KNOCKBACK_TIER = 1;
/** Slam knockback AoE radius as a multiple of the slamming unit's radius (1× unit size). */
export const LIFTED_SLAM_KNOCKBACK_RADIUS_FACTOR = 1;

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

        // Combat slam: skip damage during iFrames (env-style takeDamage is not gated globally).
        if (!unit.hasIFrames(ctx.gameTime)) {
            // Flat slam damage; return value unused, so no need for the shield/armour breakdown.
            unit.takeDamage(this.slamDamage, this.sourceUnitId, ctx.eventBus);
        }

        applySlamKnockback(unit, ctx, this.sourceUnitId, this.sourceAbilityId);

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

/**
 * Magnitude-{@link LIFTED_SLAM_KNOCKBACK_TIER} knockback for other grounded units whose centers
 * lie within {@link LIFTED_SLAM_KNOCKBACK_RADIUS_FACTOR} × the slamming unit's radius.
 */
function applySlamKnockback(
    slammingUnit: Unit,
    ctx: BuffExpireContext,
    sourceUnitId: string,
    sourceAbilityId: string,
): void {
    const units = ctx.units;
    if (!units || units.length === 0) return;

    const radius = slammingUnit.radius * LIFTED_SLAM_KNOCKBACK_RADIUS_FACTOR;
    if (!(radius > 0)) return;

    const knockbackCtx = knockbackCtxFromEngine({
        gameTime: ctx.gameTime,
        roundNumber: ctx.roundNumber,
        eventBus: ctx.eventBus,
        interruptUnitAndRefundAbilities: ctx.interruptUnitAndRefundAbilities,
    });
    const source = { unitId: sourceUnitId, abilityId: sourceAbilityId };

    for (const other of units) {
        if (other.id === slammingUnit.id) continue;
        if (!other.active || !other.isAlive() || other.isSpawning()) continue;
        // Still-floating lifts slam on their own expiry; don't shove them mid-air.
        if (other.hasBuff(LIFTED_BUFF_TYPE)) continue;

        const dist = Math.hypot(other.x - slammingUnit.x, other.y - slammingUnit.y);
        if (dist > radius) continue;

        tryApplyKnockbackByTier(
            other,
            LIFTED_SLAM_KNOCKBACK_TIER,
            source,
            slammingUnit.x,
            slammingUnit.y,
            knockbackCtx,
        );
    }
}
