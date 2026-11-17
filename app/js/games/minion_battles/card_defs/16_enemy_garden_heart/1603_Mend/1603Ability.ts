/**
 * Mend - Mender Bloom node. A rooted bloom that heals every other friendly node near it (Knots and the Heart included,
 * shelled or not) in one pulse after a short windup. The AI only casts it when some node in reach is hurt, so a
 * priority target that is not on the way to the Heart can be ignored only at a cost.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { Effect } from '../../../game/effects/Effect';
import { applyHeal } from '../../../game/units/unitHeal';
import { peekNodeTreeState } from '../../../game/units/components/nodeTree';
import type { Unit } from '../../../game/units/Unit';
import { areAllies } from '../../../game/teams';
import type { CardDef } from '../../types';
import {
    MEND_ABILITY_ID,
    MEND_AMOUNT,
    MEND_COOLDOWN_SEC,
    MEND_RADIUS_PX,
    MEND_WINDUP_SEC,
    NIGHTBLOOM_SECONDARY,
} from '../gardenHeartConstants';
import IMAGE from './mend.svg?raw';

const PULSE_END = MEND_WINDUP_SEC + 1 / 60;

/** Living friendly node units (they carry a node-tree slice) within the Bloom's reach, excluding the caster. */
export function nodesInMendReach(caster: Unit, units: readonly Unit[]): Unit[] {
    return units.filter(
        (u) =>
            u !== caster &&
            u.isAlive() &&
            areAllies(caster.teamId, u.teamId) &&
            peekNodeTreeState(u) !== undefined &&
            Math.hypot(u.x - caster.x, u.y - caster.y) <= MEND_RADIUS_PX + u.radius,
    );
}

function mendPulse(ctx: CastBehaviourTickContext): void {
    const { caster } = ctx;
    for (const node of nodesInMendReach(caster, ctx.engine.units)) {
        // No injury penalty: the Bloom's heal is the fight's clock, not a permanent wound on the Heart.
        applyHeal(node, MEND_AMOUNT, 0, { eventBus: ctx.engine.eventBus, sourceUnitId: caster.id });
    }
    ctx.engine.addEffect(
        new Effect({
            x: caster.x,
            y: caster.y,
            duration: 0.6,
            effectType: 'Pulse',
            effectData: { colors: [NIGHTBLOOM_SECONDARY] },
        }),
    );
}

export const MendAbility_1603: AbilityStatic = defineAbility({
    id: MEND_ABILITY_ID,
    name: 'Mend',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: MEND_WINDUP_SEC,
    abilityTimings: [
        { id: 'bloom', start: 0, end: MEND_WINDUP_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'pulse',
            start: MEND_WINDUP_SEC,
            end: PULSE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(mendPulse) }],
        },
        { id: 'cooldown', start: PULSE_END, end: PULSE_END + MEND_COOLDOWN_SEC, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    aiSettings: {
        minRange: 0,
        maxRange: 0,
        priority: 5,
        candidateScope: 'anyNearby',
        ninjutsu: { ignore: true },
        // Only worth a cast when a node in reach is hurt.
        canUse: (caster, ctx) => nodesInMendReach(caster, ctx.getUnits()).some((u) => u.hp < u.getEffectiveMaxHp()),
    },
    getRange: () => ({ minRange: 0, maxRange: MEND_RADIUS_PX }),
    getTooltipText(): string[] {
        return [`Heals every other nearby node by ${MEND_AMOUNT}, shelled ones and the Heart included`];
    },
});

export const MendCard_1603: CardDef = { abilityId: MEND_ABILITY_ID };
