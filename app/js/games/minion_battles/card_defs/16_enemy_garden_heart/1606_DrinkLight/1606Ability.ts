/**
 * Drink Light - Gloam Lily node. A rooted bloom that drinks the garden's light: a lilac stream runs from the nearest
 * lit light to the Lily for the whole windup, and at its end the light loses 1 strength (a weak one goes out). Any
 * range. A light drained to nothing stays out for the rest of the battle: nothing brings it back, not even killing the
 * Lily. The AI casts it whenever a lit light exists, with no player in sight needed.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { anyDevourableLight } from '../../../abilities/lightDrain';
import type { TargetDef } from '../../../abilities/targeting';
import type { CardDef } from '../../types';
import {
    DRINK_LIGHT_ABILITY_ID,
    DRINK_LIGHT_AMOUNT,
    DRINK_LIGHT_COOLDOWN_SEC,
    DRINK_LIGHT_WINDUP_SEC,
    NIGHTBLOOM_SECONDARY,
} from '../gardenHeartConstants';
import IMAGE from './drinkLight.svg?raw';

export const DrinkLightAbility_1606: AbilityStatic = defineAbility({
    id: DRINK_LIGHT_ABILITY_ID,
    name: 'Drink Light',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DRINK_LIGHT_WINDUP_SEC,
    abilityTimings: [
        {
            id: 'drink',
            start: 0,
            end: DRINK_LIGHT_WINDUP_SEC,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.DrainLight({
                        amount: DRINK_LIGHT_AMOUNT,
                        target: 'nearestLit',
                        stream: { color: NIGHTBLOOM_SECONDARY },
                    }),
                },
            ],
        },
        {
            id: 'cooldown',
            start: DRINK_LIGHT_WINDUP_SEC,
            end: DRINK_LIGHT_WINDUP_SEC + DRINK_LIGHT_COOLDOWN_SEC,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: 0,
        priority: 5,
        // Drinks with no player in sight: the garden's light is the target, not the party.
        castWithoutEnemies: true,
        ninjutsu: { ignore: true },
        canUse: (_caster, ctx) => anyDevourableLight(ctx.getSpecialTiles()) || (ctx.getLightSources?.().length ?? 0) > 0,
    },
    getRange: () => ({ minRange: 0, maxRange: 0 }),
    getTooltipText(): string[] {
        return [
            `Drinks ${DRINK_LIGHT_AMOUNT} strength from the nearest light, from any distance`,
            'A light drunk dry stays out for the rest of the battle',
        ];
    },
});

export const DrinkLightCard_1606: CardDef = { abilityId: DRINK_LIGHT_ABILITY_ID };
