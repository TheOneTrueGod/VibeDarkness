/**
 * Conjure Crystal - Court Magician. He starts the fight with only a couple of crystals; every time he
 * loses another 10% of his max HP (90% down to 50%, `COURT_CRYSTAL_CONJURE_STEPS` steps) a new one forms
 * beside him, and the next Rearrange carries it out to the fight. Never chosen by the AI: the `hpStep`
 * component casts it (see the `court_magician` def), and marks each step on his HP bar.
 */

import type { AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { spawnUnitsAtPoints } from '../../../abilities/CastBehaviours/SpawnUnitsBehaviour';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { TargetDef } from '../../../abilities/targeting';
import { Effect } from '../../../game/effects/Effect';
import { fitSlotsToTerrain } from '../../../game/formations/formationPlacement';
import { enemySpawnDefToSpawnDefinition } from '../../../game/units/spawning/adapters';
import {
    COURT_CRYSTAL_CONJURE_HP_STEP,
    COURT_CRYSTAL_CONJURE_STEPS,
    ENEMY_COURT_CRYSTAL,
} from '../../../constants/enemyConstants';
import type { CardDef } from '../../types';
import { CONJURE_CRYSTAL_ABILITY_ID, COURT_PULSE_COLORS } from '../courtMagicianConstants';
import IMAGE from './conjureCrystal.svg?raw';

/** The new crystal forms this far from the magician, in a random direction. */
export const CONJURE_CRYSTAL_DISTANCE = 70;
/** A brief gathering before the crystal forms (a cast needs a window before its instant). */
export const CONJURE_CRYSTAL_GATHER_SEC = 0.25;
const CONJURE_END = CONJURE_CRYSTAL_GATHER_SEC + 1 / 60;
const COOLDOWN_END = CONJURE_END + 0.2;

/** Where the next crystal forms: beside the caster, nudged off rock. */
function conjurePoint(ctx: CastBehaviourTickContext): { x: number; y: number } {
    const angle = (ctx.engine.generateRandomInteger(0, 359) * Math.PI) / 180;
    const raw = {
        x: ctx.caster.x + Math.cos(angle) * CONJURE_CRYSTAL_DISTANCE,
        y: ctx.caster.y + Math.sin(angle) * CONJURE_CRYSTAL_DISTANCE,
    };
    return fitSlotsToTerrain([raw], ctx.engine.terrainManager)[0] ?? raw;
}

export const ConjureCrystalAbility_1407: AbilityStatic = defineAbility({
    id: CONJURE_CRYSTAL_ABILITY_ID,
    name: 'Conjure Crystal',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 1,
    prefireTime: CONJURE_CRYSTAL_GATHER_SEC,
    abilityTimings: [
        { id: 'gather', start: 0, end: CONJURE_CRYSTAL_GATHER_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'conjure',
            start: CONJURE_CRYSTAL_GATHER_SEC,
            end: CONJURE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        const [crystal] = spawnUnitsAtPoints(
                            ctx.caster,
                            { ...enemySpawnDefToSpawnDefinition(ENEMY_COURT_CRYSTAL, 'ai'), teamId: ctx.caster.teamId },
                            [conjurePoint(ctx)],
                            ctx.engine,
                        );
                        if (!crystal) return;
                        ctx.engine.addEffect(
                            new Effect({
                                x: crystal.x,
                                y: crystal.y,
                                duration: 0.45,
                                effectType: 'Pulse',
                                effectData: { colors: [...COURT_PULSE_COLORS] },
                            }),
                        );
                    }),
                },
            ],
        },
        { id: 'cooldown', start: CONJURE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [] as TargetDef[],
    // Cast only by the hpStep component, never by ability picking.
    aiSettings: { minRange: 0, maxRange: 0, ninjutsu: { ignore: true }, canUse: () => false },
    getRange: () => ({ minRange: 0, maxRange: 0 }),
    getTooltipText(): string[] {
        return [
            `Each time he loses ${Math.round(COURT_CRYSTAL_CONJURE_HP_STEP * 100)}% of his max HP (down to ${Math.round((1 - COURT_CRYSTAL_CONJURE_STEPS * COURT_CRYSTAL_CONJURE_HP_STEP) * 100)}%), a new crystal forms beside him`,
        ];
    },
});

export const ConjureCrystalCard_1407: CardDef = { abilityId: CONJURE_CRYSTAL_ABILITY_ID };
