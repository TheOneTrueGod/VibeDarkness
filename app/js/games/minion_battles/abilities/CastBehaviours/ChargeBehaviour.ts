/**
 * ChargeBehaviour: lunge movement plus a damage sweep along the path, for charge abilities.
 *
 * Attach it to the lunge interval (`timingStart: 'start'`, `timingEnd: 'end'`). Each tick it moves the
 * caster along the lunge (reusing {@link LungeMovement}) and damages every enemy the swept capsule
 * touched, once per unit (de-duplicated through the note's `hitTargetIds`).
 *
 * The lunge note (aim, fixed direction, origin, hit list) is owned by the ability: it builds the note in
 * `beginActiveCast` and tells the behaviour how to find it via `getNote`. The behaviour captures the
 * lunge origin on the first tick (the live caster position, so windup knockback keeps the lunge aligned
 * with the telegraph) and can clear the note and `castPayload` when the window ends.
 *
 * Use `createCharge(config)` in `castBehaviours`; `CastBehaviours.Charge` should be the same call.
 */
import type { Unit } from '../../game/units/Unit';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type {
    CastBehaviour,
    CastBehaviourBaseContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { LungeMovement, type LungeSegment, type LungeTarget } from '../behaviors/LungeMovement';
import { ThickLineHitbox } from '../../hitboxes/ThickLineHitbox';
import { tryDamageOrBlock } from '../blockingHelpers';

/** The slice of a charge note the behaviour reads and writes. Abilities may keep extra fields. */
export interface ChargeNoteLike extends LungeTarget {
    /** Unit ids already hit by this lunge; the behaviour appends to it. */
    hitTargetIds: string[];
}

export interface ChargeConfig<TNote extends ChargeNoteLike> {
    /** Lunge distance in px (measured from the lunge origin, excluding caster radius). */
    maxRange: number;
    /** Length of the lunge window in seconds; must match the interval the behaviour is attached to. */
    lungeDuration: number;
    /** Path capsule radius as a multiple of the caster radius. */
    capsuleRadiusMultiplier: number;
    damage: number | ((ctx: CastBehaviourTickContext) => number);
    /** Resolves the lunge note for this window (null skips the tick). */
    getNote: (ctx: CastBehaviourBaseContext) => TNote | null;
    /** Terrain sampling step (px) for the lunge; defaults to LungeMovement's. */
    collisionStep?: number;
}

/**
 * World point used for directional block checks (angle from defender toward "incoming").
 * Prefers a point behind the charger along motion so the blocked arc stays stable through
 * overlap/passthrough.
 */
export function approachSideAttackSource(
    caster: Unit,
    note: LungeTarget,
    segment: LungeSegment,
): { x: number; y: number } {
    const lookbackPx = Math.max(caster.radius * 6, 120);
    let nx: number | undefined;
    let ny: number | undefined;
    if (note.chargeDirX !== undefined && note.chargeDirY !== undefined) {
        const mag = Math.hypot(note.chargeDirX, note.chargeDirY);
        if (mag > 1e-6) {
            nx = note.chargeDirX / mag;
            ny = note.chargeDirY / mag;
        }
    }
    if (nx === undefined || ny === undefined) {
        const dx = segment.toX - segment.fromX;
        const dy = segment.toY - segment.fromY;
        const mag = Math.hypot(dx, dy);
        if (mag > 1e-6) {
            nx = dx / mag;
            ny = dy / mag;
        }
    }
    if (nx !== undefined && ny !== undefined) {
        return { x: caster.x - nx * lookbackPx, y: caster.y - ny * lookbackPx };
    }
    return { x: caster.x, y: caster.y };
}

export class ChargeBehaviour<TNote extends ChargeNoteLike = ChargeNoteLike> implements CastBehaviour {
    private readonly config: ChargeConfig<TNote>;
    private readonly lunge: LungeMovement;
    private _blockSource: 'caster' | 'approach' = 'caster';
    private _stopOnBlocked = false;
    private _advanceOnLastTick = true;
    private _clearNoteOnEnd = false;
    private _onHit: ((hitUnit: Unit, ctx: CastBehaviourTickContext) => void) | null = null;
    private _onEnd: ((ctx: CastBehaviourTickContext, note: TNote) => void) | null = null;

    constructor(config: ChargeConfig<TNote>) {
        this.config = config;
        // Progress is read from the timing window, so the lunge itself has no windup offset.
        this.lunge = new LungeMovement({
            maxRange: config.maxRange,
            lungeDuration: config.lungeDuration,
            windupTime: 0,
            ...(config.collisionStep !== undefined ? { collisionStep: config.collisionStep } : {}),
        });
    }

    /**
     * Where blocking checks measure the incoming attack from. `'caster'` (default) uses the caster's
     * position; `'approach'` uses a point behind the charger along its motion, which keeps the
     * blocked arc stable once the charger overlaps the defender.
     */
    withBlockSource(source: 'caster' | 'approach'): this {
        this._blockSource = source;
        return this;
    }

    /** A blocked hit ends the unit loop for this tick; remaining units are retried on the next tick. */
    withStopOnBlocked(enabled = true): this {
        this._stopOnBlocked = enabled;
        return this;
    }

    /**
     * Whether the window's last tick still moves and hits. Default true. Set false when the
     * ability historically stopped one tick short of the end.
     */
    withAdvanceOnLastTick(enabled: boolean): this {
        this._advanceOnLastTick = enabled;
        return this;
    }

    /** On the last tick, clears the ability note and the active cast's `castPayload`. */
    withClearNoteOnEnd(enabled = true): this {
        this._clearNoteOnEnd = enabled;
        return this;
    }

    /** Runs once per unit that took a hit (for hit visuals). Runs after the hit is recorded. */
    withOnHit(cb: (hitUnit: Unit, ctx: CastBehaviourTickContext) => void): this {
        this._onHit = cb;
        return this;
    }

    /** Runs on the last tick after any movement and hits, before the note is cleared. */
    withOnEnd(cb: (ctx: CastBehaviourTickContext, note: TNote) => void): this {
        this._onEnd = cb;
        return this;
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const note = this.config.getNote(ctx);
        if (!note) return;

        if (this._advanceOnLastTick || !ctx.isLastTick) {
            if (note.lungeOriginX === undefined) {
                note.lungeOriginX = ctx.caster.x;
                note.lungeOriginY = ctx.caster.y;
            }
            const segment = this.lunge.advanceByProgress(
                ctx.caster,
                note,
                this.prevProgress(ctx),
                ctx.windowProgress,
                ctx.engine,
            );
            this.damageEnemiesInPath(ctx, note, segment);
        }

        if (ctx.isLastTick) {
            this._onEnd?.(ctx, note);
            if (this._clearNoteOnEnd) this.clearNote(ctx);
        }
    }

    /**
     * Window progress at the start of this tick. The window clamps it at 0, but a tick that straddles
     * the windup end begins before the lunge, so the swept segment starts slightly behind the origin.
     */
    private prevProgress(ctx: CastBehaviourTickContext): number {
        if (ctx.prevWindowProgress > 0 || ctx.localDt === undefined) return ctx.prevWindowProgress;
        return Math.min(0, ctx.windowProgress - ctx.localDt / this.config.lungeDuration);
    }

    private clearNote(ctx: CastBehaviourTickContext): void {
        const active = ctx.caster.activeAbilities.find((a) => a.abilityId === ctx.abilityId);
        if (active) active.castPayload = undefined;
        ctx.caster.clearAbilityNote();
    }

    private damageEnemiesInPath(ctx: CastBehaviourTickContext, note: TNote, segment: LungeSegment): void {
        const eng: AbilityEngineContext = ctx.engine;
        const caster = ctx.caster;
        const capsuleRadius = caster.radius * this.config.capsuleRadiusMultiplier;
        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng, caster, segment.fromX, segment.fromY, segment.toX, segment.toY, capsuleRadius,
        );
        const source = this._blockSource === 'approach'
            ? approachSideAttackSource(caster, note, segment)
            : { x: caster.x, y: caster.y };
        const damage = typeof this.config.damage === 'function' ? this.config.damage(ctx) : this.config.damage;

        for (const unit of hitUnits) {
            if (note.hitTargetIds.includes(unit.id)) continue;
            if (unit.hasIFrames(eng.gameTime)) continue;

            const outcome = tryDamageOrBlock(unit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: source.x,
                attackerY: source.y,
                attackerId: caster.id,
                abilityId: ctx.abilityId,
                damage,
                attackType: 'charging',
            });
            if (!outcome.hit) {
                if (this._stopOnBlocked) return;
                continue;
            }
            note.hitTargetIds.push(unit.id);
            this._onHit?.(unit, ctx);
        }
    }
}

/** Builds a Charge behaviour. Intended to be exposed as `CastBehaviours.Charge(config)`. */
export function createCharge<TNote extends ChargeNoteLike>(config: ChargeConfig<TNote>): ChargeBehaviour<TNote> {
    return new ChargeBehaviour(config);
}
