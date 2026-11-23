/**
 * Displacement Strike (spirit side) - the pet ability behind the player's Displacement Strike card (0715).
 *
 * The spirit flickers apart (`CasterSplitFlicker`), then three clones of it appear round the target and the
 * spirit dashes through it (`DashStrike`). Each clone opens with a Dog Bite (0701, a dash-through strike) on a
 * living enemy target, then hunts on its own: clones are ordinary `spirit_clone` pets of the spirit's owner
 * (`spawnPetForOwner`), with the spirit's abilities and modifiers, so commands can pick them too. They last
 * `DISPLACEMENT_STRIKE_CLONE_SECONDS` with the `'finishCast'` expiry policy (a clone whose time runs out
 * mid-cast finishes that cast first). A recast fades the owner's earlier clones first, so they never stack.
 * At a point with no enemy, the clones still appear there and start hunting.
 *
 * Pet-only: no aiSettings and no card of its own. Restored only by the command granting a commandCharge.
 */
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, AbilityStatic } from '../../../abilities/Ability';
import type { TargetDef } from '../../../abilities/targeting';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { SpawnUnitsBehaviour } from '../../../abilities/CastBehaviours/SpawnUnitsBehaviour';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { commandPetAbility } from '../../../abilities/petCommands';
import { findNearestEnemyInArea } from '../../../abilities/targetHelpers';
import { pickCloneSpawnPositions } from '../../../game/displacer/clonePlacement';
import { Effect } from '../../../game/effects/Effect';
import { themedSlashTrail } from '../../../game/effects/slashTrail';
import { areEnemies } from '../../../game/teams';
import { peekPetState } from '../../../game/units/components/petComponent';
import { getLivingPetsOfUnit } from '../../../game/units/petHelpers';
import { spawnPetForOwner } from '../../../game/units/petSpawn';
import type { Unit } from '../../../game/units/Unit';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { getThemeById, themeGlowPair } from '../../../themes/abilityTheme';
import { SPIRIT_STRIKE_DAMAGE, SPIRIT_STRIKE_DASH_SECONDS } from '../0710_SpiritStrike/0710Ability';
import { SPIRIT_FLURRY_AREA_RADIUS } from '../0711_SpiritFlurry/0711Ability';
import {
    DISPLACEMENT_STRIKE_CARD_ID,
    DISPLACEMENT_STRIKE_CLONE_COUNT,
    DISPLACEMENT_STRIKE_CLONE_SECONDS,
    DISPLACEMENT_STRIKE_PET_ABILITY_ID,
} from './0716Constants';

export {
    DISPLACEMENT_STRIKE_PET_ABILITY_ID,
    DISPLACEMENT_STRIKE_CARD_ID,
    DISPLACEMENT_STRIKE_CLONE_COUNT,
    DISPLACEMENT_STRIKE_CLONE_SECONDS,
};
/** Pet def the clones spawn as (`PET_DEFS`). */
export const DISPLACEMENT_STRIKE_CLONE_PET_DEF_ID = 'spirit_clone';
/** The clones' opening strike on the target. */
export const DISPLACEMENT_STRIKE_CLONE_OPENER_ID = `${formatGroupId(AbilityGroupId.Command)}01`;
/** Damage of the spirit's own dash through the target. */
export const DISPLACEMENT_STRIKE_DAMAGE = SPIRIT_STRIKE_DAMAGE;
/** Spirit's split wind-up (seconds). */
export const DISPLACEMENT_STRIKE_SPLIT_SECONDS = 0.3;
/** Clones appear within this ring round the target (px). */
export const DISPLACEMENT_STRIKE_CLONE_RADIUS = 80;
export const DISPLACEMENT_STRIKE_CLONE_MIN_DISTANCE = 36;
export const DISPLACEMENT_STRIKE_CLONE_MIN_SPACING = 32;

const SPLIT_SEPARATION_PX = 16;
const SPLIT_FLICKER_FPS = 16;
const COOLDOWN_SECONDS = 0.1;
const STRIKE_START = DISPLACEMENT_STRIKE_SPLIT_SECONDS;
const STRIKE_END = STRIKE_START + SPIRIT_STRIKE_DASH_SECONDS;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

/** The owner of the casting pet, if it has one. */
function ownerOf(ctx: CastBehaviourTickContext): Unit | undefined {
    const ownerId = peekPetState(ctx.caster)?.ownerUnitId;
    return ownerId ? ctx.engine.getUnit(ownerId) : undefined;
}

/**
 * The enemy the cast strikes: a living enemy target unit, else (a point target, as the 0715 card's anchored
 * pick always is) the enemy nearest that point within the spirit's strike area, the same one its `DashStrike`
 * picks.
 */
function livingEnemyTarget(ctx: CastBehaviourTickContext): Unit | undefined {
    const first = ctx.allTargets[0];
    const unit = first?.type === 'unit' && first.unitId ? ctx.engine.getUnit(first.unitId) : undefined;
    if (unit?.isAlive() && areEnemies(ctx.caster.teamId, unit.teamId)) return unit;
    if (first?.type !== 'pixel' || !first.position) return undefined;
    return findNearestEnemyInArea(ctx.engine.units, ctx.caster, first.position, SPIRIT_FLURRY_AREA_RADIUS) ?? undefined;
}

/** Where the clones gather: the struck enemy, the target unit, the target point, or the caster. */
function targetCenter(ctx: CastBehaviourTickContext): { x: number; y: number } {
    const first = ctx.allTargets[0];
    const unit = livingEnemyTarget(ctx) ?? (first?.unitId ? ctx.engine.getUnit(first.unitId) : undefined);
    if (unit) return { x: unit.x, y: unit.y };
    return first?.position ?? { x: ctx.caster.x, y: ctx.caster.y };
}

function commandPulse(x: number, y: number): Effect {
    const { light, dark } = themeGlowPair(getThemeById('command'));
    return new Effect({
        x,
        y,
        duration: 0.45,
        effectType: 'Pulse',
        effectData: { colors: [light, dark, 0xffffff] },
    });
}

function buildCloneSpawn(): SpawnUnitsBehaviour {
    return CastBehaviours.SpawnUnits({
        // Earlier clones of this owner fade first, so a recast never stacks past one batch.
        replacePrevious: (ctx) => {
            const owner = ownerOf(ctx);
            if (!owner) return [];
            return getLivingPetsOfUnit(owner, ctx.engine.units).filter(
                (p) => p.id !== ctx.caster.id && hasUnitTag(p, UnitTag.Clone),
            );
        },
        positions: (ctx) => {
            const eng = ctx.engine;
            const occupied = eng.units.filter((u) => u.isAlive()).map((u) => ({ x: u.x, y: u.y }));
            return pickCloneSpawnPositions(targetCenter(ctx), {
                count: DISPLACEMENT_STRIKE_CLONE_COUNT,
                radius: DISPLACEMENT_STRIKE_CLONE_RADIUS,
                minDistanceFromCenter: DISPLACEMENT_STRIKE_CLONE_MIN_DISTANCE,
                minSpacing: DISPLACEMENT_STRIKE_CLONE_MIN_SPACING,
                isFree: (x, y) => eng.terrainManager?.isPassable(x, y) ?? true,
                occupied,
                randomInt: (min, max) => eng.generateRandomInteger(min, max),
            });
        },
        // Each clone is a pet of the spirit's owner, copying the spirit (minus this ability: clones never split).
        spawnOne: (ctx, at) => {
            const eng = ctx.engine;
            const owner = ownerOf(ctx);
            if (!owner || !eng.spawnUnit) return undefined;
            const spawnUnit = eng.spawnUnit.bind(eng);
            const caster = ctx.caster;
            return spawnPetForOwner({ spawnUnit }, owner, {
                petDefId: DISPLACEMENT_STRIKE_CLONE_PET_DEF_ID,
                at,
                abilityIds: caster.abilities.filter((id) => id !== DISPLACEMENT_STRIKE_PET_ABILITY_ID),
                maxHp: caster.maxHp,
                // A full copy of the spirit's modifiers, which already include the owner's research.
                abilityModifiers: caster.abilityModifiers,
                inheritOwnerModifiers: false,
                unitTags: [UnitTag.Clone],
                ephemeralDespawnAtGameTime: eng.gameTime + DISPLACEMENT_STRIKE_CLONE_SECONDS,
                ephemeralExpiryPolicy: 'finishCast',
                spawnSource: 'abilitySpawn',
            });
        },
        onSpawned: (ctx, _clone, _index, at) => {
            ctx.engine.addEffect(commandPulse(at.x, at.y));
        },
        // Each clone opens by dashing through a living enemy target; otherwise its hunt AI takes over.
        onBatchSpawned: (ctx, clones) => {
            const target = livingEnemyTarget(ctx);
            if (!target || clones.length === 0) return;
            commandPetAbility(clones, DISPLACEMENT_STRIKE_CLONE_OPENER_ID, [{ type: 'unit', unitId: target.id }], ctx.engine);
        },
    });
}

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'split',
        start: 0,
        end: STRIKE_START,
        abilityPhase: AbilityPhase.Windup,
        castBehaviours: [
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: CastBehaviours.CasterSplitFlicker({
                    maxSeparationPx: SPLIT_SEPARATION_PX,
                    framesPerSecond: SPLIT_FLICKER_FPS,
                }),
            },
        ],
    },
    {
        id: 'strike',
        start: STRIKE_START,
        end: STRIKE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            { timingStart: 'start', behaviour: buildCloneSpawn() },
            {
                timingStart: 'start',
                timingEnd: 'end',
                // A point target strikes the enemy nearest it, or dashes through the empty spot.
                behaviour: CastBehaviours.DashStrike()
                    .withDamage(DISPLACEMENT_STRIKE_DAMAGE)
                    .withAreaTargeting(SPIRIT_FLURRY_AREA_RADIUS)
                    .withSlashTrail(themedSlashTrail('command')),
            },
        ],
    },
    {
        id: 'cooldown',
        start: STRIKE_END,
        end: STRIKE_END + COOLDOWN_SECONDS,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

export const DisplacementStrikePetAbility: AbilityStatic = defineAbility({
    id: DISPLACEMENT_STRIKE_PET_ABILITY_ID,
    name: 'Displacement Strike',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: STRIKE_START,
    // No aiSettings: only the Displacement Strike card (0715) makes the spirit cast this.
    targets: [{ type: 'unit', label: 'Target' }] as TargetDef[],
    abilityTimings: ABILITY_TIMINGS,
    getRange: () => ({ minRange: 0, maxRange: 100000 }),
    getTooltipText(): string[] {
        return [
            `Split into {${DISPLACEMENT_STRIKE_CLONE_COUNT}} clones round the target and dash through it for {${DISPLACEMENT_STRIKE_DAMAGE}} damage. The clones dash through it too, then hunt enemies for {${DISPLACEMENT_STRIKE_CLONE_SECONDS}}s.`,
        ];
    },
});
