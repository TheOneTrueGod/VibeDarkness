/**
 * mirrorToClones — makes Displacer clones echo an ability the boss just started.
 *
 * Called from the casting ability's trigger code (`beginActiveCast`). Clones' own casts never
 * mirror (the caller's `Clone` tag check is enforced here too), so echoes cannot recurse.
 * Each chosen clone is first granted the ability use it needs, then a cast order is queued
 * with a stagger so the echoes do not all fire on the same tick.
 */

import { grantAbilityUses } from '../../abilities/abilityUses';
import type { ResolvedTarget } from '../types';
import type { Unit } from '../units/Unit';
import { hasUnitTag, UnitTag } from '../units/unitTag';
import { getActorStepRate, type ActorClockEngine } from '../time/actorClock';
import {
    CLONE_MIRROR_MAX_CLONES,
    CLONE_MIRROR_STAGGER_SEC,
    CLONE_MIRROR_START_DELAY_SEC,
    DISPLACER_CLONE_ID,
} from './displacerConstants';

/** Engine tick rate (60 Hz fixed step); duplicated to avoid importing GameEngine from ability code. */
const TICKS_PER_SECOND = 60;

/** Minimal engine surface the mirroring needs (satisfied by GameEngine). */
export interface MirrorEngineLike {
    units: Unit[];
    gameTick: number;
    /** Present on the real engine; used to scale echo delays to the caster's clock. */
    gameTime?: number;
    timeManager?: ActorClockEngine['timeManager'];
    generateRandomInteger(min: number, max: number): number;
    state: {
        orderMgr: {
            queueOrder(
                atTick: number,
                order: { unitId: string; abilityId: string; targets: ResolvedTarget[] },
            ): void;
        };
    };
}

/** Living, idle Displacer clones on the caster's team that can start a new cast. */
export function getMirrorCandidates(engine: Pick<MirrorEngineLike, 'units'>, caster: Unit): Unit[] {
    return engine.units.filter(
        (u) =>
            u.id !== caster.id &&
            u.isAlive() &&
            u.characterId === DISPLACER_CLONE_ID &&
            hasUnitTag(u, UnitTag.Clone) &&
            u.teamId === caster.teamId &&
            u.activeAbilities.length === 0,
    );
}

/**
 * Queue staggered echoes of `abilityId` on up to `maxClones` clones.
 * Returns the ids of the clones chosen, in firing order (empty when the caster is itself a clone).
 */
export function mirrorAbilityToClones(
    engine: MirrorEngineLike,
    caster: Unit,
    abilityId: string,
    targets: ResolvedTarget[],
    opts: { maxClones?: number; staggerSec?: number; timeScale?: number } = {},
): string[] {
    // Clone casts must never re-trigger mirroring.
    if (hasUnitTag(caster, UnitTag.Clone)) return [];

    const maxClones = opts.maxClones ?? CLONE_MIRROR_MAX_CLONES;
    // timeScale < 1 compresses both the first follow-up delay and the gaps (enraged spirit: faster echoes).
    const timeScale = opts.timeScale ?? 1;
    const staggerSec = (opts.staggerSec ?? CLONE_MIRROR_STAGGER_SEC) * timeScale;
    const startDelaySec = CLONE_MIRROR_START_DELAY_SEC * timeScale;

    // Partial Fisher-Yates with the engine's synced RNG so every client picks the same clones.
    const pool = getMirrorCandidates(engine, caster);
    const count = Math.min(maxClones, pool.length);
    for (let i = 0; i < count; i++) {
        const j = engine.generateRandomInteger(i, pool.length - 1);
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const chosen = pool.slice(0, count);

    // Echo delays are measured on the caster's clock (owner clock): a hasted caster's echoes arrive in fewer ticks.
    // Exactly 1 at pace 1 with no tempo, so the delay is unchanged there.
    const casterRate = getActorStepRate(caster, { gameTime: engine.gameTime ?? 0, timeManager: engine.timeManager });
    const delayScale = casterRate > 0 && casterRate !== 1 ? 1 / casterRate : 1;

    chosen.forEach((clone, index) => {
        grantAbilityUses(clone, abilityId, 1);
        const delayTicks = Math.max(1, Math.round((startDelaySec + index * staggerSec) * TICKS_PER_SECOND * delayScale));
        engine.state.orderMgr.queueOrder(engine.gameTick + delayTicks, {
            unitId: clone.id,
            abilityId,
            targets: targets.map((t) => ({ ...t })),
        });
    });
    return chosen.map((c) => c.id);
}
