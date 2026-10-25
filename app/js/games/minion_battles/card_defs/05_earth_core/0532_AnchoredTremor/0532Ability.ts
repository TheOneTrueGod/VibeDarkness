/**
 * Anchored Tremor: an Earth Core channel. The caster picks a centre, then four tremor pulses roll
 * out from it, 0.35s apart, each hitting everything in a 65px radius harder than the last (+2 per
 * pulse), with a bonus against enemies standing on stone. Built on the reusable `Pulse` behaviour, so
 * the pulse number reaches the damage function and the tremor is blockable like any attack.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { isUnitOnStone } from '../../../abilities/earthCoreHelpers';
import { type CardDef } from '../../types';
import { nullHitbox } from '../../../hitboxes';

const ABILITY_ID = '0532';
const PULSE_INTERVAL = 0.35;
const BASE_DAMAGE = 3;
const RAMP_PER_PULSE = 2;
const STONE_BONUS_DAMAGE = 2;
const RADIUS = 65;
const ACTIVE_START = 0.2;
const ACTIVE_END = 1.6;

/**
 * One pulse lands at the end of each 0.35s period, matching the contracting ring the emitter draws:
 * pulses at 0.55s, 0.9s, 1.25s and 1.6s (the last on the window's final tick).
 */
const tremorPulses = CastBehaviours.Pulse({ everySeconds: PULSE_INTERVAL, windowSeconds: ACTIVE_END - ACTIVE_START })
    .withHitbox({ shape: 'circle', range: RADIUS })
    .withDamage((ctx, unit) =>
        BASE_DAMAGE
        + (ctx.pulseNumber - 1) * RAMP_PER_PULSE
        + (isUnitOnStone(ctx.engine.terrainManager, unit) ? STONE_BONUS_DAMAGE : 0));

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: ACTIVE_START, abilityPhase: AbilityPhase.Windup },
    {
        id: 'active',
        start: ACTIVE_START,
        end: ACTIVE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'select', label: 'Pulse center', hitbox: nullHitbox, filter: 'any', allowMiss: true },
        emitterDef: {
            mode: 'interval',
            intervalSeconds: PULSE_INTERVAL,
            effectType: 'Explosion',
            effectRadius: RADIUS,
            effectProperties: { color: 0x27d3c8, direction: 'contract' },
            fireImmediately: true,
        },
        behaviour: tremorPulses,
    },
    { id: 'cooldown', start: ACTIVE_END, end: 2.0, abilityPhase: AbilityPhase.Cooldown },
];

const ANCHORED_TREMOR_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="15" fill="#485230"/>
  <path d="M8 24 Q14 16 20 24 Q26 32 32 24" fill="none" stroke="#bef264" stroke-width="3"/>
</svg>`;

export const AnchoredTremor: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Anchored Tremor',
    image: ANCHORED_TREMOR_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: 1,
    prefireTime: ACTIVE_START,
    abilityTimings: TIMINGS,
    targets: [],
    aiSettings: { minRange: 0, maxRange: 260 },
    getTooltipText(): string[] {
        return ['Pulsing tremor ramping damage each pulse. Enemies on stone take extra damage.'];
    },
    getAbilityStates(): [] {
        return [];
    },
};

export const AnchoredTremorCard: CardDef = {
    abilityId: ABILITY_ID,
};
