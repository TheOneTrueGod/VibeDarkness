/**
 * PhantomDecoy - Displacer Spirit super ability (costs 1 super bar). The spirit conjures a ring of
 * illusory copies of itself around a player, hiding among them while the clones echo its bolts.
 * Any clones from an earlier decoy fade first. Used in the second half of every third round (rounds 0, 3, 6, ...), i.e. at 0.5, 3.5, 6.5 rounds.
 */

import type { AbilityRecoveryRule, AbilityStatic } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import type { TargetDef } from '../../../abilities/targeting';
import { Effect } from '../../../game/effects/Effect';
import type { ResolvedTarget } from '../../../game/types';
import type { SpawnDefinition } from '../../../game/units/spawning/spawnDefinition';
import { enemySpawnDefToSpawnDefinition } from '../../../game/units/spawning/adapters';
import type { Unit } from '../../../game/units/Unit';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { ENEMY_DISPLACER_CLONE } from '../../../constants/enemyConstants';
import { pickCloneSpawnPositions } from '../../../game/displacer/clonePlacement';
import {
    PHANTOM_DECOY_CLONE_COUNT,
    PHANTOM_DECOY_ROUND_INTERVAL,
    PHANTOM_DECOY_ROUND_WINDOW,
} from '../../../game/displacer/displacerConstants';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}19`;
export const PHANTOM_DECOY_ID = CARD_ID;

/** Super bars spent per cast. */
export const PHANTOM_DECOY_SUPER_COST = 1;
export const PHANTOM_DECOY_WINDUP = 0.8;
const COOLDOWN_END = PHANTOM_DECOY_WINDUP + 0.1 + 1.0;
/** Boss may use this when a player is within this range (px). */
export const PHANTOM_DECOY_AI_RANGE = 400;

const SPIRIT_BLUE = 0x3366cc;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const PHANTOM_DECOY_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="22" cy="34" r="14" fill="#3366cc" opacity="0.45"/>
  <circle cx="42" cy="34" r="14" fill="#3366cc" opacity="0.45"/>
  <circle cx="32" cy="26" r="14" fill="#9fc2ff" opacity="0.8"/>
</svg>`;

interface DecoyEngine {
    units: Unit[];
    gameTime: number;
    getUnit(id: string): Unit | undefined;
    spawnUnit(def: SpawnDefinition, spawnSource?: import('../../../game/types').SpawnSource): Unit[];
    addEffect(effect: Effect): void;
    generateRandomInteger(min: number, max: number): number;
    terrainManager: { isPassable(x: number, y: number): boolean } | null;
}

/** Living clones on the caster's team (earlier decoys). */
export function getTeamClones(engine: Pick<DecoyEngine, 'units'>, caster: Unit): Unit[] {
    return engine.units.filter(
        (u) => u.isAlive() && hasUnitTag(u, UnitTag.Clone) && u.teamId === caster.teamId,
    );
}

const _base: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Phantom Decoy',
    image: PHANTOM_DECOY_IMAGE,
    resourceCost: { resourceId: 'super', amount: PHANTOM_DECOY_SUPER_COST },
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: PHANTOM_DECOY_WINDUP,
    abilityTimings: [
        { id: 'conjure', start: 0, end: PHANTOM_DECOY_WINDUP, abilityPhase: AbilityPhase.Windup },
        { id: 'summon', start: PHANTOM_DECOY_WINDUP, end: PHANTOM_DECOY_WINDUP + 0.1, abilityPhase: AbilityPhase.Active, doNotRefund: true },
        { id: 'cooldown', start: PHANTOM_DECOY_WINDUP + 0.1, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'unit', label: 'Target' }] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: PHANTOM_DECOY_AI_RANGE,
        maxUsesPerRound: 1,
        priority: 20,
        ninjutsu: { ignore: true },
        roundWindow: PHANTOM_DECOY_ROUND_WINDOW,
        requireAffordable: true,
        canUse: (_caster: Unit, ctx: { gameTime: number }) =>
            Math.floor(ctx.gameTime / ROUND_DURATION) % PHANTOM_DECOY_ROUND_INTERVAL === 0,
    },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: PHANTOM_DECOY_AI_RANGE }),

    getTooltipText(): string[] {
        return [
            `Spend ${PHANTOM_DECOY_SUPER_COST} super bar to conjure ${PHANTOM_DECOY_CLONE_COUNT} clones around a player`,
            'Clones echo Displacer Bolts and fade when the Displacer Spirit falls',
        ];
    },
});

export const PhantomDecoyAbility: AbilityStatic = {
    ..._base,

    doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
    ): void {
        if (prevTime >= PHANTOM_DECOY_WINDUP || currentTime < PHANTOM_DECOY_WINDUP) return;
        const eng = engine as DecoyEngine;

        const first = targets[0];
        const targetUnit = first?.unitId ? eng.getUnit(first.unitId) : undefined;
        const center = targetUnit
            ? { x: targetUnit.x, y: targetUnit.y }
            : first?.position ?? { x: caster.x, y: caster.y };

        // Earlier decoys fade so clone counts never stack past one batch.
        for (const old of getTeamClones(eng, caster)) {
            old.ephemeralDespawnAtGameTime = eng.gameTime;
        }

        const occupied = eng.units.filter((u) => u.isAlive()).map((u) => ({ x: u.x, y: u.y }));
        const positions = pickCloneSpawnPositions(center, {
            isFree: (x, y) => eng.terrainManager?.isPassable(x, y) ?? true,
            occupied,
            randomInt: (min, max) => eng.generateRandomInteger(min, max),
        });

        for (const pos of positions) {
            eng.spawnUnit(
                {
                    ...enemySpawnDefToSpawnDefinition(ENEMY_DISPLACER_CLONE, 'ai'),
                    teamId: caster.teamId,
                    controllable: false,
                    unitTags: [],
                    placement: { kind: 'fixedWorld', x: pos.x, y: pos.y },
                },
                'abilitySpawn',
            );
            eng.addEffect(new Effect({
                x: pos.x,
                y: pos.y,
                duration: 0.5,
                effectType: 'Pulse',
                effectData: { colors: [SPIRIT_BLUE, 0x9fc2ff, 0x112244] },
            }));
        }
    },
};

export const PhantomDecoyCard: CardDef = {
    abilityId: CARD_ID,
};
