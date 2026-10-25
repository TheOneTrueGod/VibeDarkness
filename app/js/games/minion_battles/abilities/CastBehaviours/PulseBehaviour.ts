/**
 * Pulse — reusable CastBehaviour that repeats a hitbox every N seconds through its timing window,
 * handing the pulse number to the damage function (ramping channels, boss channels, super moves).
 *
 * Schedule: pulse k (1-based) lands at `firstPulseAt + (k - 1) * everySeconds` seconds into the
 * window, for every k that fits inside `windowSeconds`. `firstPulseAt` defaults to `everySeconds`
 * (each pulse lands at the end of its period, like a contracting ring); `0` pulses on the first tick.
 * A pulse due exactly at the window's end lands on its last tick.
 *
 * The schedule is a pure function of the window progress the engine reports (which already follows
 * the caster's local clock, so haste and slow reshape it), and the behaviour keeps no state: a tick
 * fires the pulses whose time lies between the previous tick's progress and this one's. Pulses
 * therefore match in preview and committed runs.
 *
 * Each pulse resolves `withHitbox` around `withOrigin` (default: the cast's target point, else the
 * caster), then runs `tryDamageOrBlock` on every unit, so pulses are blockable and fire
 * ON_ATTACK_HIT like any attack. The attack origin for blocking is the pulse origin.
 *
 * Usage:
 *   behaviour: pulse({ everySeconds: 0.35, windowSeconds: 1.4 })   // CastBehaviours.Pulse(...) once indexed
 *     .withHitbox({ shape: 'circle', range: 65 })
 *     .withDamage((ctx, unit) => 3 + (ctx.pulseNumber - 1) * 2)
 */

import type { Unit } from '../../game/units/Unit';
import type { HitboxEngineContext } from '../../hitboxes/Hitbox';
import type { HitboxSpec } from '../../hitboxes/HitboxSpec';
import type { HitboxDef } from '../hitboxDef';
import { resolveHitbox } from '../hitboxDef';
import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import { resolveTargetToPoint } from '../targeting';
import { tryDamageOrBlock, type DamageOutcome, type TryDamageOrBlockParams } from '../blockingHelpers';

/** Tolerance (seconds) for float drift when comparing a pulse time with the window clock. */
const PULSE_TIME_EPSILON = 1e-6;

export interface PulseConfig {
    /** Seconds between pulses. */
    everySeconds: number;
    /** Length of the timing window this behaviour runs in, in seconds. */
    windowSeconds: number;
    /** Seconds into the window of the first pulse. Default `everySeconds`; `0` pulses immediately. */
    firstPulseAt?: number;
}

/** The tick context plus which pulse this is. */
export interface PulseTickContext extends CastBehaviourTickContext {
    /** 1-based index of this pulse within the cast window. */
    pulseNumber: number;
    /** How many pulses the window holds in total. */
    pulseCount: number;
    /** Where this pulse is centred (also the attack origin for blocking). */
    origin: { x: number; y: number };
}

/** How many pulses of `config` the window holds in total. */
export function pulseTotal(config: PulseConfig): number {
    const first = config.firstPulseAt ?? config.everySeconds;
    if (config.everySeconds <= 0 || config.windowSeconds + PULSE_TIME_EPSILON < first) return 0;
    return Math.floor((config.windowSeconds - first + PULSE_TIME_EPSILON) / config.everySeconds) + 1;
}

/** How many pulses have landed once `elapsedSeconds` of the window have passed. */
export function pulsesLandedBy(elapsedSeconds: number, config: PulseConfig): number {
    const first = config.firstPulseAt ?? config.everySeconds;
    if (config.everySeconds <= 0 || elapsedSeconds + PULSE_TIME_EPSILON < first) return 0;
    const landed = Math.floor((elapsedSeconds - first + PULSE_TIME_EPSILON) / config.everySeconds) + 1;
    return Math.min(landed, pulseTotal(config));
}

export class PulseBehaviour implements CastBehaviour {
    private readonly _config: PulseConfig;
    private _hitbox: HitboxDef | HitboxSpec | null = null;
    private _origin: ((ctx: CastBehaviourTickContext) => { x: number; y: number } | null) | null = null;
    private _damage: number | ((ctx: PulseTickContext, unit: Unit) => number) | null = null;
    private _attackType: TryDamageOrBlockParams['attackType'] = 'melee';
    private _onHit: ((ctx: PulseTickContext, unit: Unit, outcome: DamageOutcome) => void) | null = null;
    private _onPulse: ((ctx: PulseTickContext, hitUnits: Unit[]) => void) | null = null;

    constructor(config: PulseConfig) {
        this._config = config;
    }

    /**
     * The area each pulse hits. A `HitboxDef` is resolved around the pulse origin; a `HitboxSpec`
     * is resolved from the caster toward the aim point, exactly as `MeleeAttack` does.
     */
    withHitbox(def: HitboxDef | HitboxSpec): this {
        this._hitbox = def;
        return this;
    }

    /** Where each pulse is centred. Default: the cast's target point, else the caster. Null skips the pulse. */
    withOrigin(resolver: (ctx: CastBehaviourTickContext) => { x: number; y: number } | null): this {
        this._origin = resolver;
        return this;
    }

    /** Damage per unit per pulse: a flat amount, or a function of the pulse (`ctx.pulseNumber`) and the unit. */
    withDamage(
        amountOrResolver: number | ((ctx: PulseTickContext, unit: Unit) => number),
        opts?: { attackType?: TryDamageOrBlockParams['attackType'] },
    ): this {
        this._damage = amountOrResolver;
        this._attackType = opts?.attackType ?? 'melee';
        return this;
    }

    /** Called for each unit the pulse attacked, with the outcome (`hit` is false when blocked). */
    onHit(fn: (ctx: PulseTickContext, unit: Unit, outcome: DamageOutcome) => void): this {
        this._onHit = fn;
        return this;
    }

    /** Called once per pulse after its hits, even when nothing was hit (terrain, VFX, riders). */
    onPulse(fn: (ctx: PulseTickContext, hitUnits: Unit[]) => void): this {
        this._onPulse = fn;
        return this;
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const { windowSeconds } = this._config;
        const landedBefore = ctx.isFirstTick ? 0 : pulsesLandedBy(ctx.prevWindowProgress * windowSeconds, this._config);
        const landedNow = pulsesLandedBy(ctx.windowProgress * windowSeconds, this._config);
        if (landedNow <= landedBefore) return;

        const origin = this._origin
            ? this._origin(ctx)
            : (resolveTargetToPoint(ctx.target, ctx.engine) ?? { x: ctx.caster.x, y: ctx.caster.y });
        if (!origin) return;

        const pulseCount = pulseTotal(this._config);
        for (let pulseNumber = landedBefore + 1; pulseNumber <= landedNow; pulseNumber++) {
            this.firePulse({ ...ctx, pulseNumber, pulseCount, origin });
        }
    }

    private firePulse(ctx: PulseTickContext): void {
        const hitUnits = this.resolveHits(ctx);
        for (const unit of hitUnits) {
            if (this._damage === null) continue;
            const damage = typeof this._damage === 'function' ? this._damage(ctx, unit) : this._damage;
            const outcome = tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: ctx.origin.x,
                attackerY: ctx.origin.y,
                attackerId: ctx.caster.id,
                abilityId: ctx.abilityId,
                damage,
                attackType: this._attackType,
            });
            this._onHit?.(ctx, unit, outcome);
        }
        this._onPulse?.(ctx, hitUnits);
    }

    private resolveHits(ctx: PulseTickContext): Unit[] {
        if (this._hitbox === null) return [];
        const aim = resolveTargetToPoint(ctx.target, ctx.engine) ?? ctx.origin;
        const engine = ctx.engine as unknown as HitboxEngineContext;
        if ('maxRange' in this._hitbox) {
            return this._hitbox.resolveHits(engine, ctx.caster, aim.x, aim.y);
        }
        return resolveHitbox(this._hitbox, {
            engine,
            caster: ctx.caster,
            originX: ctx.origin.x,
            originY: ctx.origin.y,
            aimX: aim.x,
            aimY: aim.y,
        });
    }
}

/** Factory for the `CastBehaviours.Pulse(config)` entry (the index is wired by the integrator). */
export const pulse = (config: PulseConfig): PulseBehaviour => new PulseBehaviour(config);
