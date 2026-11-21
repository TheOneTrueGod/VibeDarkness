/**
 * Hit rules: which units a damaging source may hit.
 *
 * - `hostile` (the default everywhere): units on a team hostile to the source's team.
 * - `allExceptKin`: every unit except those carrying `kinTag`, on any team. This is the "Wild" attack: it hits the
 *   source's own side too, sparing only its kin (the Garden Heart's plants carry `UnitTag.GardenKin`).
 *
 * Plain serializable data, so projectiles, area damage options and component options can carry one. The engine does
 * not know what a kin tag means beyond this rule.
 */

import type { TeamId } from './teams';
import { areEnemies } from './teams';
import type { Unit } from './units/Unit';
import { isUnitTag, type UnitTag } from './units/unitTag';

export type HitRule = { kind: 'hostile' } | { kind: 'allExceptKin'; kinTag: UnitTag };

export const HOSTILE_HIT_RULE: HitRule = { kind: 'hostile' };

/** Whether a source on `sourceTeamId` may hit `target` under `rule` (absent rule = `hostile`). Liveness etc. stay with callers. */
export function canHit(
    rule: HitRule | undefined,
    sourceTeamId: TeamId,
    target: Pick<Unit, 'teamId' | 'tags'>,
): boolean {
    if (!rule || rule.kind === 'hostile') return areEnemies(sourceTeamId, target.teamId);
    return !target.tags.includes(rule.kinTag);
}

/** Wild rule for a kin tag. */
export function wildHitRule(kinTag: UnitTag): HitRule {
    return { kind: 'allExceptKin', kinTag };
}

/** Copy a rule (rules are immutable data, but callers store their own copy). */
export function cloneHitRule(rule: HitRule): HitRule {
    return rule.kind === 'hostile' ? { kind: 'hostile' } : { kind: 'allExceptKin', kinTag: rule.kinTag };
}

/** Parse a rule from wire JSON; anything unknown or `hostile` yields `undefined` (the default). */
export function parseHitRuleFromJSON(raw: unknown): HitRule | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as { kind?: unknown; kinTag?: unknown };
    if (r.kind === 'allExceptKin' && typeof r.kinTag === 'string' && isUnitTag(r.kinTag)) {
        return { kind: 'allExceptKin', kinTag: r.kinTag };
    }
    return undefined;
}
