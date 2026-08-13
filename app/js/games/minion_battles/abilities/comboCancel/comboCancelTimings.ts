/**
 * Combo Cancel timeline helper — attaches conditionalCancel at cooldown phase entry.
 * Mirrors the Entombed linger pattern so the pause fires before Cooldown phase begins.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import { buildComboCancelDef } from './comboCancelDef';

const DEFAULT_LINGER_SEC = 1 / 60;

function isComboOrEntombLingerInterval(interval: AbilityTimingInterval): boolean {
    return interval.id.includes('_entomb_wall_linger') || interval.id.includes('_combo_cancel_linger');
}

export function withComboCancelAtPhaseStart(
    timings: readonly AbilityTimingInterval[],
    phase: AbilityPhase,
    opts?: {
        /** Cooldown interval id (default: first interval whose abilityPhase === phase). */
        cooldownIntervalId?: string;
        /** Interval whose exit triggers combo pause (default: interval ending at cooldown.start). */
        cancelIntervalId?: string;
        lingerSec?: number;
        lingerIdPrefix?: string;
    },
): AbilityTimingInterval[] {
    const lingerSec = opts?.lingerSec ?? DEFAULT_LINGER_SEC;

    let cooldownIdx = opts?.cooldownIntervalId
        ? timings.findIndex((t) => t.id === opts.cooldownIntervalId)
        : timings.findIndex((t) => t.abilityPhase === phase);
    if (cooldownIdx < 0) {
        throw new Error(`withComboCancelAtPhaseStart: missing cooldown interval for phase ${phase}`);
    }

    let working = [...timings];
    let cooldown = working[cooldownIdx]!;

    const priorLingerIdx = working.findIndex(
        (t, i) => i < cooldownIdx && t.end === cooldown.start && isComboOrEntombLingerInterval(t),
    );
    const hasLingerBeforeCooldown = priorLingerIdx >= 0;

    if (!hasLingerBeforeCooldown) {
        const lingerIdPrefix = opts?.lingerIdPrefix ?? cooldown.id;
        const lingerInterval: AbilityTimingInterval = {
            id: `${lingerIdPrefix}_combo_cancel_linger`,
            start: cooldown.start,
            end: cooldown.start + lingerSec,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: 'Combo window',
        };
        const shiftedCooldown: AbilityTimingInterval = {
            ...cooldown,
            start: cooldown.start + lingerSec,
            end: cooldown.end + lingerSec,
        };
        const out: AbilityTimingInterval[] = [];
        for (let i = 0; i < working.length; i++) {
            if (i === cooldownIdx) {
                out.push(lingerInterval);
                out.push(shiftedCooldown);
                continue;
            }
            out.push(working[i]!);
        }
        working = out;
        cooldownIdx += 1;
        cooldown = shiftedCooldown;
    }

    let cancelIdx = -1;
    if (opts?.cancelIntervalId) {
        const explicitIdx = working.findIndex((t) => t.id === opts.cancelIntervalId);
        if (explicitIdx >= 0 && !working[explicitIdx]?.conditionalCancel) {
            cancelIdx = explicitIdx;
        }
    }
    if (cancelIdx < 0) {
        cancelIdx = working.findIndex((t, i) => i < cooldownIdx && t.end === cooldown.start);
    }
    if (cancelIdx < 0) {
        throw new Error('withComboCancelAtPhaseStart: could not resolve cancel interval');
    }

    const comboDef = buildComboCancelDef();
    return working.map((t, i) => {
        if (i !== cancelIdx) return t;
        return { ...t, conditionalCancel: comboDef };
    });
}
