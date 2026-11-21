/**
 * Pinwheel: rotating arms that each fire a projectile every `fireIntervalSec` through the behaviour's window.
 *
 * - `arms` arms are evenly spaced and turn clockwise at `turnDegPerSec`. `counterArms` arms are evenly spaced
 *   too, turn the other way, and start offset by half the clockwise arm spacing (one of each: opposite).
 * - Shot k of every arm leaves the caster at `k * fireIntervalSec` into the window (shot 0 on the first tick), for
 *   every k that lies before the window's end. The arm's angle at that moment is `start +/- turnDegPerSec * time`.
 * - The start angle is `startAngle` degrees, or `'random'`: a whole-degree roll from the engine RNG, taken at
 *   setup. The start angle and window length live in the behaviour payload (plain JSON), so a cast saved
 *   mid-window replays the same projectiles.
 * - The schedule is a pure function of the window progress the engine reports (which follows the caster's
 *   local clock), so preview and committed runs match.
 *
 * Fires from the caster's position. Who the projectiles hit is `projectile.hitRule` (default hostile).
 */

import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { Projectile } from '../../game/projectiles/Projectile';
import type { HitRule } from '../../game/hitRule';

/** Tolerance (seconds) for float drift between a shot time and the window clock. */
const SHOT_TIME_EPSILON = 1e-6;

export interface PinwheelProjectile {
    /** px/s. */
    speed: number;
    damage: number;
    radius: number;
    /** Travel distance in px. */
    range: number;
    /** Projectile type id (render look). */
    type: string;
    /** Who the shots may hit; absent = hostile. */
    hitRule?: HitRule;
}

export interface PinwheelConfig {
    /** Clockwise arms (evenly spaced). */
    arms: number;
    /** Anticlockwise arms (evenly spaced, offset by half the clockwise arm spacing). */
    counterArms: number;
    /** Degrees per second each arm turns. */
    turnDegPerSec: number;
    /** Seconds between shots from each arm. */
    fireIntervalSec: number;
    /** Degrees (0 = east, clockwise on screen) or a random whole degree rolled at setup. */
    startAngle: 'random' | number;
    projectile: PinwheelProjectile;
    /** Window length in seconds. Default: the window the engine reports at setup. */
    windowSeconds?: number;
}

/** Plain JSON kept on the cast. */
interface PinwheelPayload {
    startDeg: number;
    windowSeconds: number;
}

/** Shots each arm has fired once `elapsedSeconds` of the window have passed (shot 0 at time 0). */
export function pinwheelShotsBy(
    elapsedSeconds: number,
    config: Pick<PinwheelConfig, 'fireIntervalSec'>,
    windowSeconds: number,
): number {
    if (config.fireIntervalSec <= 0 || elapsedSeconds < -SHOT_TIME_EPSILON) return 0;
    const total = Math.ceil((windowSeconds - SHOT_TIME_EPSILON) / config.fireIntervalSec);
    const fired = Math.floor((elapsedSeconds + SHOT_TIME_EPSILON) / config.fireIntervalSec) + 1;
    return Math.max(0, Math.min(fired, total));
}

/** Launch angles (degrees) of every arm `timeSeconds` into the window: clockwise arms first, then counter arms. */
export function pinwheelArmAngles(config: PinwheelConfig, startDeg: number, timeSeconds: number): number[] {
    const turn = config.turnDegPerSec * timeSeconds;
    const angles: number[] = [];
    const armSpacing = config.arms > 0 ? 360 / config.arms : 360;
    for (let i = 0; i < config.arms; i++) angles.push(startDeg + i * armSpacing + turn);
    const counterSpacing = config.counterArms > 0 ? 360 / config.counterArms : 0;
    const counterOffset = armSpacing / 2;
    for (let i = 0; i < config.counterArms; i++) angles.push(startDeg + counterOffset + i * counterSpacing - turn);
    return angles;
}

export class PinwheelBehaviour implements CastBehaviour {
    constructor(private readonly config: PinwheelConfig) {}

    onSetup(ctx: CastBehaviourSetupContext): void {
        const start = this.config.startAngle;
        const startDeg = start === 'random' ? ctx.engine.generateRandomInteger(0, 359) : start;
        const windowSeconds = this.config.windowSeconds ?? ctx.windowSeconds ?? 0;
        const payload: PinwheelPayload = { startDeg, windowSeconds };
        ctx.setBehaviourPayload(payload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as PinwheelPayload | undefined;
        if (!payload || payload.windowSeconds <= 0) return;
        const { windowSeconds, startDeg } = payload;
        const firedBefore = ctx.isFirstTick
            ? 0
            : pinwheelShotsBy(ctx.prevWindowProgress * windowSeconds, this.config, windowSeconds);
        const firedNow = pinwheelShotsBy(ctx.windowProgress * windowSeconds, this.config, windowSeconds);
        for (let shot = firedBefore; shot < firedNow; shot++) {
            const time = shot * this.config.fireIntervalSec;
            for (const deg of pinwheelArmAngles(this.config, startDeg, time)) {
                this.fire(ctx, deg);
            }
        }
    }

    private fire(ctx: CastBehaviourTickContext, deg: number): void {
        const p = this.config.projectile;
        const rad = (deg * Math.PI) / 180;
        const projectile = new Projectile({
            x: ctx.caster.x,
            y: ctx.caster.y,
            velocityX: Math.cos(rad) * p.speed,
            velocityY: Math.sin(rad) * p.speed,
            damage: p.damage,
            sourceTeamId: ctx.caster.teamId,
            sourceUnitId: ctx.caster.id,
            sourceAbilityId: ctx.abilityId,
            maxDistance: p.range,
            projectileType: p.type,
            ...(p.hitRule ? { hitRule: p.hitRule } : {}),
        });
        projectile.radius = p.radius;
        ctx.engine.addProjectile(projectile);
    }
}
