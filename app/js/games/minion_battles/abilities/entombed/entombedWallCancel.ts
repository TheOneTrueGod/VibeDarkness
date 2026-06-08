/**
 * Reusable helper for “Entombed / inside wall” conditional-cancel pauses.
 *
 * Pattern:
 * - Add `conditionalCancel` to a late Active interval so the player can choose an
 *   `Entombed` ability or `wait` while still inside rock.
 * - Insert a tiny Active “linger” interval right before the cooldown interval, so the
 *   cast is still considered non-Cooldown for suppression purposes when the pause fires.
 */

import { AbilityPhase, type AbilityTimingInterval, type ConditionalCancelDef } from '../abilityTimings';

const DEFAULT_LINGER_SEC = 1 / 60;

export const ENTOMB_WALL_CONDITIONAL_CANCEL: ConditionalCancelDef = {
    condition: ({ caster, engine }) => {
        const tm = engine.terrainManager;
        return tm != null && !tm.isPassable(caster.x, caster.y);
    },
    abilityTagFilter: ['Entombed'] as const,
};

export function withEntombedWallConditionalCancelAndLinger(
    timings: readonly AbilityTimingInterval[],
    opts: {
        /**
         * Interval whose exit should trigger conditional cancel (typically the last `active*`).
         */
        cancelIntervalId: string;
        /** Interval id for the cooldown band to shift forward. */
        cooldownIntervalId: string;
        /** Tiny Active linger inserted immediately before cooldown. */
        lingerSec?: number;
        /** Stable id prefix for the inserted linger band. */
        lingerIdPrefix?: string;
    },
): AbilityTimingInterval[] {
    const lingerSec = opts.lingerSec ?? DEFAULT_LINGER_SEC;

    const cancelIdx = timings.findIndex((t) => t.id === opts.cancelIntervalId);
    if (cancelIdx < 0) {
        throw new Error(
            `withEntombedWallConditionalCancelAndLinger: missing cancel interval ${opts.cancelIntervalId}`,
        );
    }

    const cooldownIdx = timings.findIndex((t) => t.id === opts.cooldownIntervalId);
    if (cooldownIdx < 0) {
        throw new Error(
            `withEntombedWallConditionalCancelAndLinger: missing cooldown interval ${opts.cooldownIntervalId}`,
        );
    }

    const cooldown = timings[cooldownIdx]!;
    const lingerIdPrefix = opts.lingerIdPrefix ?? opts.cancelIntervalId;

    const lingerInterval: AbilityTimingInterval = {
        id: `${lingerIdPrefix}_entomb_wall_linger`,
        start: cooldown.start,
        end: cooldown.start + lingerSec,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'Wall escape',
    };

    const shiftedCooldown: AbilityTimingInterval = {
        ...cooldown,
        start: cooldown.start + lingerSec,
        end: cooldown.end + lingerSec,
    };

    const out: AbilityTimingInterval[] = [];
    for (let i = 0; i < timings.length; i++) {
        const t = timings[i]!;
        if (i === cooldownIdx) {
            out.push(lingerInterval);
            out.push(shiftedCooldown);
            continue;
        }

        if (i === cancelIdx) {
            out.push({
                ...t,
                conditionalCancel: ENTOMB_WALL_CONDITIONAL_CANCEL,
            });
            continue;
        }

        out.push(t);
    }

    return out;
}

