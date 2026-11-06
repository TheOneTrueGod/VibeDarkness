/**
 * Blink - Court Magician. When the party has caught up with him and landed a few hits, his outline
 * shivers for a moment and he vanishes in a violet puff, reappearing across the arena as far from the
 * players as he can get. The AI decides when (see the `courtMagician` tree) and where; this ability
 * is just the short shimmer and the teleport.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { TargetDef } from '../../../abilities/targeting';
import { Effect } from '../../../game/effects/Effect';
import type { CardDef } from '../../types';
import { BLINK_ABILITY_ID, COURT_PULSE_COLORS } from '../courtMagicianConstants';
import IMAGE from './blink.svg?raw';

export const BLINK_SHIMMER_SEC = 0.3;
const VANISH_END = BLINK_SHIMMER_SEC + 1 / 60;
const COOLDOWN_END = VANISH_END + 0.35;
/** Any point on a boss arena. */
export const BLINK_MAX_RANGE = 2000;

function puff(ctx: CastBehaviourTickContext, at: { x: number; y: number }): void {
    ctx.engine.addEffect(
        new Effect({ x: at.x, y: at.y, duration: 0.45, effectType: 'Pulse', effectData: { colors: [...COURT_PULSE_COLORS] } }),
    );
}

export const BlinkAbility_1405: AbilityStatic = defineAbility({
    id: BLINK_ABILITY_ID,
    name: 'Blink',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 3,
    prefireTime: BLINK_SHIMMER_SEC,
    abilityTimings: [
        {
            id: 'shimmer',
            start: 0,
            end: BLINK_SHIMMER_SEC,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.CasterShake({ from: 0, to: 3 }),
                },
            ],
        },
        {
            id: 'vanish',
            start: BLINK_SHIMMER_SEC,
            end: VANISH_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                { timingStart: 'start', behaviour: CastBehaviours.Teleport({ onDepart: puff, onArrive: puff }) },
            ],
        },
        { id: 'cooldown', start: VANISH_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Destination' }] as TargetDef[],
    // The courtMagician tree orders Blink directly with a chosen destination; generic ability
    // picking must never choose it (it would blink onto the player).
    aiSettings: { minRange: 0, maxRange: 0, ninjutsu: { ignore: true }, canUse: () => false },
    getRange: () => ({ minRange: 0, maxRange: BLINK_MAX_RANGE }),
    getTooltipText(): string[] {
        return ['Shimmer, then vanish and reappear far from the players'];
    },
});

export const BlinkCard_1405: CardDef = { abilityId: BLINK_ABILITY_ID };
