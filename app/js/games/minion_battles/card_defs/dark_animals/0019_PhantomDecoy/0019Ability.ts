/**
 * PhantomDecoy - Displacer Spirit super ability (costs 1 super bar). The spirit conjures a ring of
 * illusory copies of itself around a player, hiding among them while the clones echo its bolts.
 * Any clones from an earlier decoy fade first, and the spirit then swaps places with one random new
 * clone. Used in the second half of every third round (rounds 0, 3, 6, ...), i.e. at 0.5, 3.5, 6.5 rounds.
 */

import type { AbilityRecoveryRule, AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase, withJuggernautBeforeCooldown } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import type { TargetDef } from '../../../abilities/targeting';
import { Effect } from '../../../game/effects/Effect';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { SpawnUnitsBehaviour } from '../../../abilities/CastBehaviours/SpawnUnitsBehaviour';
import { enemySpawnDefToSpawnDefinition } from '../../../game/units/spawning/adapters';
import type { Unit } from '../../../game/units/Unit';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { ENEMY_DISPLACER_CLONE } from '../../../constants/enemyConstants';
import { pickCloneSpawnPositions } from '../../../game/displacer/clonePlacement';
import {
    PHANTOM_DECOY_CLONE_COUNT,
    PHANTOM_DECOY_ENRAGED_CLONE_COUNT,
    DISPLACER_FADE_IN_MS,
    PHANTOM_DECOY_SPLIT_FLICKER_FPS,
    PHANTOM_DECOY_SPLIT_SEPARATION_PX,
} from '../../../game/displacer/displacerConstants';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}19`;
export const PHANTOM_DECOY_ID = CARD_ID;

/** Super bars spent per cast. */
export const PHANTOM_DECOY_SUPER_COST = 1;
export const PHANTOM_DECOY_WINDUP = 0.8;
const COOLDOWN_END = PHANTOM_DECOY_WINDUP + 0.1 + 1.0;
/** No range cap: the spirit can conjure around any living player, at any distance, seen or not. */
export const PHANTOM_DECOY_AI_RANGE = Number.POSITIVE_INFINITY;

const SPIRIT_BLUE = 0x3366cc;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const PHANTOM_DECOY_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="22" cy="34" r="14" fill="#3366cc" opacity="0.45"/>
  <circle cx="42" cy="34" r="14" fill="#3366cc" opacity="0.45"/>
  <circle cx="32" cy="26" r="14" fill="#9fc2ff" opacity="0.8"/>
</svg>`;

function spiritPulse(x: number, y: number): Effect {
    return new Effect({
        x,
        y,
        duration: 0.5,
        effectType: 'Pulse',
        effectData: { colors: [SPIRIT_BLUE, 0x9fc2ff, 0x112244] },
    });
}

/** Living clones on the caster's team (earlier decoys). */
export function getTeamClones(engine: Pick<AbilityEngineContext, 'units'>, caster: Unit): Unit[] {
    return engine.units.filter(
        (u) => u.isAlive() && hasUnitTag(u, UnitTag.Clone) && u.teamId === caster.teamId,
    );
}

/** Conjures the clone ring around the target (or the caster), then the spirit swaps places with one clone. */
function buildDecoySpawn(): SpawnUnitsBehaviour {
    return CastBehaviours.SpawnUnits({
        template: (ctx) => ({
            ...enemySpawnDefToSpawnDefinition(ENEMY_DISPLACER_CLONE, 'ai'),
            teamId: ctx.caster.teamId,
            controllable: false,
            unitTags: [],
        }),
        // Earlier decoys fade so clone counts never stack past one batch.
        replacePrevious: (ctx) => getTeamClones(ctx.engine, ctx.caster),
        positions: (ctx) => {
            const eng = ctx.engine;
            const first = ctx.allTargets[0];
            const targetUnit = first?.unitId ? eng.getUnit(first.unitId) : undefined;
            const center = targetUnit
                ? { x: targetUnit.x, y: targetUnit.y }
                : first?.position ?? { x: ctx.caster.x, y: ctx.caster.y };
            const occupied = eng.units.filter((u) => u.isAlive()).map((u) => ({ x: u.x, y: u.y }));
            const enraged = hasUnitTag(ctx.caster, UnitTag.Enraged);
            return pickCloneSpawnPositions(center, {
                count: enraged ? PHANTOM_DECOY_ENRAGED_CLONE_COUNT : PHANTOM_DECOY_CLONE_COUNT,
                isFree: (x, y) => eng.terrainManager?.isPassable(x, y) ?? true,
                occupied,
                randomInt: (min, max) => eng.generateRandomInteger(min, max),
            });
        },
        onSpawned: (ctx, clone, _index, pos) => {
            // Clones start at the same health fraction as the spirit (fractional hp is fine).
            const { caster } = ctx;
            const hpFraction = caster.maxHp > 0 ? Math.max(0, Math.min(1, caster.hp / caster.maxHp)) : 1;
            clone.hp = clone.maxHp * hpFraction;
            ctx.engine.addEffect(spiritPulse(pos.x, pos.y));
        },
        // The spirit hides among its copies: swap places with one of them at random.
        onBatchSpawned: (ctx, spawned) => {
            if (spawned.length === 0) return;
            const { caster, engine: eng } = ctx;
            const clone = spawned[eng.generateRandomInteger(0, spawned.length - 1)]!;
            const { x, y } = caster;
            caster.x = clone.x;
            caster.y = clone.y;
            clone.x = x;
            clone.y = y;
            caster.clearMovement();
            clone.clearMovement();
            for (const at of [{ x, y }, { x: caster.x, y: caster.y }]) {
                eng.addEffect(spiritPulse(at.x, at.y));
            }
            // The spirit flickered out at the end of its wind-up; it fades back in with its new decoys
            // (which fade in on appearing, `appearFadeInMs`), all at once.
            eng.eventBus.emit('unit_fade_in', { unitId: caster.id, durationMs: DISPLACER_FADE_IN_MS });
        },
    });
}

export const PhantomDecoyAbility: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Phantom Decoy',
    image: PHANTOM_DECOY_IMAGE,
    resourceCost: { resourceId: 'super', amount: PHANTOM_DECOY_SUPER_COST },
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: PHANTOM_DECOY_WINDUP,
    abilityTimings: withJuggernautBeforeCooldown([
        {
            id: 'conjure',
            start: 0,
            end: PHANTOM_DECOY_WINDUP,
            abilityPhase: AbilityPhase.Windup,
            // The spirit splits: two flickering copies drift apart, then it vanishes into the decoys.
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.CasterSplitFlicker({
                        maxSeparationPx: PHANTOM_DECOY_SPLIT_SEPARATION_PX,
                        framesPerSecond: PHANTOM_DECOY_SPLIT_FLICKER_FPS,
                    }),
                },
            ],
        },
        {
            id: 'summon',
            start: PHANTOM_DECOY_WINDUP,
            end: PHANTOM_DECOY_WINDUP + 0.1,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [{ timingStart: 'start', behaviour: buildDecoySpawn() }],
        },
        { id: 'cooldown', start: PHANTOM_DECOY_WINDUP + 0.1, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ]),
    targets: [{ type: 'unit', label: 'Target' }] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: PHANTOM_DECOY_AI_RANGE,
        maxUsesPerRound: 1,
        priority: 40,
        ninjutsu: { ignore: true },
        requireAffordable: true,
        // Any player at any range (the AI's wider `nearbyEnemies` pool), not just the one the spirit can see.
        candidateScope: 'anyNearby',
        // No schedule of its own: cast only as Light Eater's follow-up or when a phase recovers it.
        onlyWhenGranted: true,
    },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: PHANTOM_DECOY_AI_RANGE }),

    getTooltipText(): string[] {
        return [
            `Spend ${PHANTOM_DECOY_SUPER_COST} super bar to conjure ${PHANTOM_DECOY_CLONE_COUNT} clones around a player (${PHANTOM_DECOY_ENRAGED_CLONE_COUNT} when enraged)`,
            'Clones echo Displacer Bolts and fade when the Displacer Spirit falls',
            'Targets a player at any range, even out of sight',
            'Cast right after Light Eater',
        ];
    },
});

export const PhantomDecoyCard: CardDef = {
    abilityId: CARD_ID,
};
