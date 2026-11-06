/**
 * Mirror Swap - Court Magician. Every time he loses another 10% of his max HP he trades places with
 * one of his crystals in a flash, leaving the crystal where the party was hitting him. He picks the
 * crystal farthest from the nearest player, so the swap is an escape. Never chosen by the AI: the
 * `hpStep` unit component casts it (see `HP_STEP_COMPONENT` on the `court_magician` def). It waits
 * while he is casting Crystal Laser, whose wall is built from the crystals.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { TargetDef } from '../../../abilities/targeting';
import { Effect } from '../../../game/effects/Effect';
import { areEnemies } from '../../../game/teams';
import type { Unit } from '../../../game/units/Unit';
import { getBoundUnits } from '../../../game/units/boundUnits';
import type { CardDef } from '../../types';
import { COURT_MAGICIAN_SWAP_HP_STEP } from '../../../constants/enemyConstants';
import { COURT_CRYSTAL_ID, COURT_PULSE_COLORS, crystalLandingPulse, MIRROR_SWAP_ABILITY_ID } from '../courtMagicianConstants';
import IMAGE from './mirrorSwap.svg?raw';

/** He trades places every time he loses this fraction of max HP. */
export const MIRROR_SWAP_HP_STEP = COURT_MAGICIAN_SWAP_HP_STEP;
const SWAP_END = 1 / 60;
const COOLDOWN_END = SWAP_END + 0.2;

/**
 * The crystal farthest from the nearest living enemy of `caster` (ties: engine order). Any crystal when
 * there are no enemies; null when he has no crystals.
 */
export function pickSwapCrystal(units: readonly Unit[], caster: Unit): Unit | null {
    const crystals = getBoundUnits(units, caster, COURT_CRYSTAL_ID);
    const enemies = units.filter((u) => u.isAlive() && areEnemies(caster.teamId, u.teamId));
    let best: Unit | null = null;
    let bestDist = -Infinity;
    for (const c of crystals) {
        const d = enemies.length === 0 ? 0 : Math.min(...enemies.map((e) => Math.hypot(e.x - c.x, e.y - c.y)));
        if (d > bestDist) {
            best = c;
            bestDist = d;
        }
    }
    return best;
}

export const MirrorSwapAbility_1406: AbilityStatic = defineAbility({
    id: MIRROR_SWAP_ABILITY_ID,
    name: 'Mirror Swap',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 1,
    prefireTime: 0,
    abilityTimings: [
        {
            id: 'swap',
            start: 0,
            end: SWAP_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.SwapPlaces({
                        partner: (ctx) => pickSwapCrystal(ctx.engine.units, ctx.caster),
                        onSwap: (ctx, crystal) => {
                            ctx.engine.addEffect(
                                new Effect({
                                    x: ctx.caster.x,
                                    y: ctx.caster.y,
                                    duration: 0.45,
                                    effectType: 'Pulse',
                                    effectData: { colors: [...COURT_PULSE_COLORS] },
                                }),
                            );
                            ctx.engine.addEffect(crystalLandingPulse(crystal));
                        },
                    }),
                },
            ],
        },
        { id: 'cooldown', start: SWAP_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [] as TargetDef[],
    // Cast only by the hpStep component, never by ability picking.
    aiSettings: { minRange: 0, maxRange: 0, ninjutsu: { ignore: true }, canUse: () => false },
    getRange: () => ({ minRange: 0, maxRange: 0 }),
    getTooltipText(): string[] {
        return [
            `Each time he loses ${Math.round(MIRROR_SWAP_HP_STEP * 100)}% of his max HP, he trades places with the crystal farthest from the players`,
        ];
    },
});

export const MirrorSwapCard_1406: CardDef = { abilityId: MIRROR_SWAP_ABILITY_ID };
