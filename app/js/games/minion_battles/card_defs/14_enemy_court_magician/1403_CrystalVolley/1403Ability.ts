/**
 * Crystal Volley - Court Magician. He points at a player and the crystals nearest them answer one by
 * one: each shivers through Crystal Ram's windup, then rams at where that player is standing when its
 * turn comes. Four crystals go normally, six when he is enraged, so the target has to keep moving and
 * the crystals end up scattered around them, ready for the next Shard Nova.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { TargetDef } from '../../../abilities/targeting';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import { commandUnitsInSequence } from '../../../abilities/commandUnits';
import { Effect } from '../../../game/effects/Effect';
import type { ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { getBoundUnits } from '../../../game/units/boundUnits';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import type { CardDef } from '../../types';
import { CRYSTAL_RAM_RANGE } from '../1404_CrystalRam/1404Ability';
import {
    COURT_CRYSTAL_ID,
    COURT_PULSE_COLORS,
    CRYSTAL_RAM_ABILITY_ID,
    CRYSTAL_VOLLEY_ABILITY_ID,
} from '../courtMagicianConstants';
import IMAGE from './crystalVolley.svg?raw';

/** Crystals sent per volley. */
export const CRYSTAL_VOLLEY_COUNT = 4;
/** Crystals sent per volley while enraged (two more). */
export const CRYSTAL_VOLLEY_ENRAGED_COUNT = 6;
/** Seconds between one crystal starting its ram and the next. */
export const CRYSTAL_VOLLEY_STAGGER_SEC = 0.6;
export const CRYSTAL_VOLLEY_POINT_SEC = 0.5;
const COMMAND_END = CRYSTAL_VOLLEY_POINT_SEC + 1 / 60;
const COOLDOWN_END = COMMAND_END + 0.7;
export const CRYSTAL_VOLLEY_AI_RANGE = 480;

export function crystalVolleyCount(caster: Unit): number {
    return hasUnitTag(caster, UnitTag.Enraged) ? CRYSTAL_VOLLEY_ENRAGED_COUNT : CRYSTAL_VOLLEY_COUNT;
}

/**
 * Idle crystals nearest `point` first (ties by engine order), at most `count`. A crystal still ramming
 * from the last volley, or with a ram already queued, is not idle.
 */
export function pickVolleyCrystals(
    units: readonly Unit[],
    caster: Unit,
    point: { x: number; y: number },
    count: number,
    hasPendingOrder: (unitId: string) => boolean = () => false,
): Unit[] {
    return getBoundUnits(units, caster, COURT_CRYSTAL_ID)
        .filter((c) => c.activeAbilities.length === 0 && !hasPendingOrder(c.id))
        .map((c, i) => ({ c, i, d: Math.hypot(c.x - point.x, c.y - point.y) }))
        .sort((a, b) => a.d - b.d || a.i - b.i)
        .slice(0, count)
        .map((e) => e.c);
}

function volley(ctx: CastBehaviourTickContext): void {
    const point = resolveTargetToPoint(ctx.target, ctx.engine);
    if (!point) return;
    const orders = ctx.engine.state?.orderMgr;
    const crystals = pickVolleyCrystals(ctx.engine.units, ctx.caster, point, crystalVolleyCount(ctx.caster), (id) =>
        orders?.hasAnyPendingOrderForUnit?.(id) ?? false,
    );
    // A unit target re-aims each crystal at the player's position when its own turn comes.
    const trackId = ctx.target.type === 'pixel' ? ctx.target.trackUnitId : ctx.target.unitId;
    const targets: ResolvedTarget[] = trackId
        ? [{ type: 'unit', unitId: trackId }]
        : [{ type: 'pixel', position: { x: point.x, y: point.y } }];
    commandUnitsInSequence(ctx.engine, ctx.caster, crystals, CRYSTAL_RAM_ABILITY_ID, targets, {
        staggerSec: CRYSTAL_VOLLEY_STAGGER_SEC,
    });
    for (const c of crystals) {
        ctx.engine.addEffect(
            new Effect({ x: c.x, y: c.y, duration: 0.4, effectType: 'Pulse', effectData: { colors: [...COURT_PULSE_COLORS] } }),
        );
    }
}

export const CrystalVolleyAbility_1403: AbilityStatic = defineAbility({
    id: CRYSTAL_VOLLEY_ABILITY_ID,
    name: 'Crystal Volley',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 2,
    prefireTime: CRYSTAL_VOLLEY_POINT_SEC,
    abilityTimings: [
        { id: 'point', start: 0, end: CRYSTAL_VOLLEY_POINT_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'command',
            start: CRYSTAL_VOLLEY_POINT_SEC,
            end: COMMAND_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(volley) }],
        },
        { id: 'cooldown', start: COMMAND_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target' }] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: CRYSTAL_VOLLEY_AI_RANGE,
        maxUsesPerRound: 2,
        priority: 30,
        ninjutsu: { ignore: true },
        canUse: (caster, ctx) =>
            getBoundUnits(ctx.getUnits(), caster, COURT_CRYSTAL_ID).some(
                (c) => c.activeAbilities.length === 0 && !ctx.hasPendingOrderForUnit?.(c.id),
            ),
    },
    getRange: () => ({ minRange: 0, maxRange: CRYSTAL_VOLLEY_AI_RANGE }),
    getTooltipText(): string[] {
        return [
            `The ${CRYSTAL_VOLLEY_COUNT} crystals nearest the target ram at them one after another (${CRYSTAL_VOLLEY_ENRAGED_COUNT} when enraged)`,
            `Each crystal re-aims when its turn comes and rams up to ${CRYSTAL_RAM_RANGE} px`,
        ];
    },
});

export const CrystalVolleyCard_1403: CardDef = { abilityId: CRYSTAL_VOLLEY_ABILITY_ID };
