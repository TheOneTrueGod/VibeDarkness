/**
 * Strike pauses. Hitstop freezes the striking body; hitstun freezes the unit that was hit.
 *
 * The deadline is a tick count (`hitPauseTicks`): authored seconds divided by `FIXED_DT` and by the
 * actor's tempo, sampled at the hit with `freeze` modifiers removed. It is not stored on the owner
 * clock, and world pace does not scale it. The buff is a `freeze` modifier with no focal, so the
 * rest of the battle keeps its tempo and `worldPace` stays put.
 *
 * Unit buffs are read by `advanceUnitLocalClocks` and removed later in `tickUnitUpkeep`, so a count
 * of N leaves the unit frozen for N subsequent ticks. Projectile buffs are removed in `expireBuffs`
 * before the step; `hitPauseSteps` keeps the buff for the step it is observed on, so the same count
 * also freezes the projectile for N steps. Force Push uses this helper with
 * `FORCE_PUSH_HIT_STOP_SECONDS` (3 ticks at tempo 1) and hitstop only.
 */

import { Buff, type BuffSerialized } from './Buff';
import { HitStopBuff, HIT_STOP_BUFF_TYPE, HIT_STOP_SOURCE_ID } from './HitStopBuff';
import type { AbilityStatic } from '../abilities/Ability';
import type { Unit } from '../game/units/Unit';
import type { Projectile } from '../game/projectiles/Projectile';
import type { EngineContext } from '../game/EngineContext';
import type { TimeModifier } from '../game/time/TimeModifier';
import { resolveTempo } from '../game/time/TimeModifier';
import { collectActorTimeModifiers } from '../game/time/actorClock';
import { FIXED_DT } from '../game/gameConstants';
import { DEFAULT_HIT_STOP_SECONDS, DEFAULT_HIT_STUN_SECONDS } from '../game/time/timeConstants';

export const HIT_STUN_BUFF_TYPE = 'hit_stun';
export const HIT_STUN_SOURCE_ID = 'hit_stun';

/** Projectile-buff source. Distinct from the unit hit-stop source and from other projectile buffs. */
export const PROJECTILE_HIT_STOP_SOURCE_ID = 'projectile_hit_stop';

export type HitPauseKind = 'hit_stop' | 'hit_stun';

/** Both strike-pause lengths in seconds, after omitted fields take the defaults. */
export interface HitImpactSeconds {
    hitstopSeconds: number;
    hitstunSeconds: number;
}

/**
 * Durations for a strike from this ability, in seconds. An unknown ability
 * (`undefined`, as when `getAbility` misses an id) uses both defaults. A field
 * left unset uses that default. `0` stays `0` and turns that side off.
 */
export function resolveHitImpactSeconds(
    ability: Pick<AbilityStatic, 'hitImpact'> | undefined,
): HitImpactSeconds {
    return {
        hitstopSeconds: ability?.hitImpact?.hitstopSeconds ?? DEFAULT_HIT_STOP_SECONDS,
        hitstunSeconds: ability?.hitImpact?.hitstunSeconds ?? DEFAULT_HIT_STUN_SECONDS,
    };
}

interface HitPauseBuffSerialized extends BuffSerialized {
    /** Remaining frozen ticks. Present only on helper-applied pauses, not Force Push's world-time buff. */
    pauseTicks: number;
    /** The apply-tick upkeep already ran and must not be skipped again after a restore. */
    ignoredApplyUpkeep?: boolean;
}

/**
 * Tempo for a new pause. `freeze` is ignored: the pause itself sets tempo to 0, and a frozen
 * local clock would never expire. 1 when no other modifiers remain.
 */
function tempoIgnoringFreeze(modifiers: readonly TimeModifier[]): number {
    return resolveTempo(modifiers.filter((modifier) => !modifier.freeze));
}

/**
 * Frozen lockstep ticks for an authored duration. `seconds / FIXED_DT / tempo`, nearest whole tick.
 * `0` when that rounds to 0 or `seconds <= 0` (no pause). Tempo 0 yields no pause.
 */
export function hitPauseTicks(seconds: number, tempo: number): number {
    if (!(seconds > 0) || !(tempo > 0)) return 0;
    const ticks = Math.round(seconds / FIXED_DT / tempo);
    return ticks > 0 ? ticks : 0;
}

/**
 * Per-actor freeze whose deadline is a tick count, not world time and not the owner's local time.
 * Upkeep on the apply tick (same `engine.gameTime`) does not consume a tick, so a hit during the
 * ability phase still freezes the next N ticks. Later ticks consume one each even when world pace
 * is 0 and `gameTime` does not move.
 */
export class HitPauseBuff extends Buff {
    readonly _type: string;
    override readonly timeModifier: TimeModifier;
    ticksRemaining: number;
    private ignoredApplyUpkeep = false;

    constructor(kind: HitPauseKind, ticks: number) {
        super({ value: ticks * FIXED_DT, unit: 'seconds' });
        this._type = kind === 'hit_stun' ? HIT_STUN_BUFF_TYPE : HIT_STOP_BUFF_TYPE;
        this.timeModifier = {
            sourceId: kind === 'hit_stun' ? HIT_STUN_SOURCE_ID : HIT_STOP_SOURCE_ID,
            tempo: 1,
            freeze: true,
        };
        this.ticksRemaining = ticks;
    }

    override onGameTick(_unit: Unit, engine: EngineContext): void {
        if (!this.ignoredApplyUpkeep && engine.gameTime === this.appliedAtTime) {
            this.ignoredApplyUpkeep = true;
            return;
        }
        if (this.ticksRemaining > 0) this.ticksRemaining -= 1;
    }

    override isExpired(_gameTime: number, _roundNumber: number, _ownerLocalTime?: number): boolean {
        return this.ticksRemaining <= 0;
    }

    override toJSON(): HitPauseBuffSerialized {
        return {
            ...super.toJSON(),
            durationValue: this.ticksRemaining * FIXED_DT,
            pauseTicks: this.ticksRemaining,
            ...(this.ignoredApplyUpkeep ? { ignoredApplyUpkeep: true } : {}),
        };
    }

    static fromJSON(data: BuffSerialized): HitPauseBuff {
        const serialized = data as HitPauseBuffSerialized;
        const kind: HitPauseKind = serialized._type === HIT_STUN_BUFF_TYPE ? 'hit_stun' : 'hit_stop';
        const buff = new HitPauseBuff(kind, serialized.pauseTicks);
        buff.appliedAtTime = serialized.appliedAtTime ?? 0;
        buff.appliedAtRound = serialized.appliedAtRound ?? 1;
        buff.ignoredApplyUpkeep = serialized.ignoredApplyUpkeep === true;
        return buff;
    }
}

/** `hit_stop` JSON is either Force Push's world-time buff or a tick-counted pause from this helper. */
export function hitStopBuffFromJSON(data: BuffSerialized): Buff {
    if (typeof (data as HitPauseBuffSerialized).pauseTicks === 'number') return HitPauseBuff.fromJSON(data);
    return HitStopBuff.fromJSON(data);
}

/**
 * Freeze `unit` for `hitPauseTicks` subsequent full ticks. A dead unit, `seconds <= 0`, or a count
 * that rounds to 0 applies nothing. Replacing a pause removes only `kind`, so hitstop cannot cut
 * a hitstun short. `gameTime` is world time (`engine.gameTime`).
 */
export function applyUnitHitPause(
    unit: Unit,
    pause: { seconds: number; kind: HitPauseKind },
    gameTime: number,
    roundNumber: number,
): void {
    if (!unit.isAlive()) return;
    const ticks = hitPauseTicks(pause.seconds, tempoIgnoringFreeze(collectActorTimeModifiers(unit)));
    if (ticks <= 0) return;
    const type = pause.kind === 'hit_stun' ? HIT_STUN_BUFF_TYPE : HIT_STOP_BUFF_TYPE;
    unit.buffs = unit.buffs.filter((buff) => buff._type !== type);
    unit.addBuff(new HitPauseBuff(pause.kind, ticks), gameTime, roundNumber);
}

/**
 * Freeze `projectile` for `hitPauseTicks` subsequent steps. `seconds <= 0` or a count that rounds
 * to 0 applies nothing and does not clear a pause already playing. Replacing removes only this
 * source. `gameTime` is world time (`engine.gameTime`).
 */
export function applyProjectileHitStop(projectile: Projectile, seconds: number, gameTime: number): void {
    const ticks = hitPauseTicks(seconds, tempoIgnoringFreeze(projectile.getTimeModifiers()));
    if (ticks <= 0) return;
    projectile.removeBuffsFromSource(PROJECTILE_HIT_STOP_SOURCE_ID);
    const buff = projectile.addBuff({
        sourceId: PROJECTILE_HIT_STOP_SOURCE_ID,
        appliedAtTime: gameTime,
        duration: null,
        timeModifier: {
            sourceId: PROJECTILE_HIT_STOP_SOURCE_ID,
            tempo: 1,
            freeze: true,
        },
    });
    buff.hitPauseSteps = ticks;
}
