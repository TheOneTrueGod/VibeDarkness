/*
 * Husk Disease Cloud — a zone-control lob, not an attack on the target. The Husk spits three
 * globs in a line that runs beside its target (turned a fixed angle left or right of it), centred on
 * the target's distance. Each lands as a 3x3 patch of the same `miasma` the Husk trails as it walks
 * and deals a little damage to every enemy caught in the patch on impact.
 *
 * The Husk takes the side that already holds less miasma, so repeated casts close in on the target
 * from both sides, narrowing where it can safely walk. Cloud rules (who it hurts, how often) are the
 * `miasma` terrain def; this file decides where the clouds land and the impact damage.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import { findMeleeAimPixelInTargets } from '../../../abilities/targeting';
import type { CastBehaviour, CastBehaviourSetupContext } from '../../../abilities/castBehaviourTypes';
import type { ProjectileLaunchBehaviour } from '../../../abilities/CastBehaviours/ProjectileLaunchBehaviour';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { damageEnemiesInTiles, getPixelTargetPosition } from '../../../abilities/targetHelpers';
import { placeTerrain } from '../../../abilities/passiveRunner';
import type { PassivePlaceTerrainEffect } from '../../../abilities/passiveDef';
import {
    pickLeastCoveredSide,
    resolveAngledLine,
    type LineSide,
    type Point,
} from '../../../abilities/projectileLine';
import { tileCentre, worldToTile } from '../../../abilities/tileAreaHelpers';
import { cellsAroundPoint, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import type { EngineContext } from '../../../game/EngineContext';
import type { Projectile } from '../../../game/projectiles/Projectile';
import type { ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { MIASMA_EFFECT_TYPE } from '../../../game/terrainEffects/terrainEffectDefs';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const DISEASE_CLOUD_ABILITY_ID = `${formatGroupId(AbilityGroupId.EnemyHusk)}03`;

/** Impact damage to each enemy standing in a landed patch. */
export const DISEASE_CLOUD_DAMAGE = 2;
/** Projectiles per cast, landing in a line. */
export const DISEASE_CLOUD_PROJECTILE_COUNT = 3;
/** A 3x3 patch: one cell either side of the landing cell. */
export const DISEASE_CLOUD_CELL_RADIUS = 1;
/** Neighbouring patches touch edge to edge, so the three form one continuous 3x9 band. */
export const DISEASE_CLOUD_SPACING = CELL_SIZE * (2 * DISEASE_CLOUD_CELL_RADIUS + 1);
/** How far the line is turned away from the target, so the middle patch lands beside it, not on it. */
export const DISEASE_CLOUD_ANGLE_RAD = (35 * Math.PI) / 180;
/** Patches linger longer than the Husk's walking trail (one round) so repeat casts accumulate. */
export const DISEASE_CLOUD_DURATION_SEC = ROUND_DURATION * 1.5;
export const DISEASE_CLOUD_TARGETING_RANGE = 280;
/** Inside this the Husk is better off grasping; the cloud is for keeping distance. */
export const DISEASE_CLOUD_MIN_AI_RANGE = 90;

const WINDUP_TIME = 1.2;
const LAUNCH_WINDOW = 0.2;
const LAUNCH_END = WINDUP_TIME + LAUNCH_WINDOW;
const COOLDOWN_END = LAUNCH_END + 2.0;
const PROJECTILE_SPEED = 180;
const PROJECTILE_RADIUS = 6;
const ARC_HEIGHT = 80;
/** Landings nearer than this to the Husk are dropped: a lob cannot land on its thrower. */
const MIN_LANDING_DISTANCE = CELL_SIZE * 1.5;
/** Farthest patch is half a line further than the targeting range. */
const MAX_PROJECTILE_RANGE = DISEASE_CLOUD_TARGETING_RANGE + DISEASE_CLOUD_SPACING;

const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const DISEASE_CLOUD_PATCH: PassivePlaceTerrainEffect = {
    type: 'place_terrain',
    effectType: MIASMA_EFFECT_TYPE,
    layer: 'air',
    cellRadius: DISEASE_CLOUD_CELL_RADIUS,
    durationSec: DISEASE_CLOUD_DURATION_SEC,
    // A fresh cast renews cloud that is already there instead of leaving it to run down.
    onExisting: 'refresh',
    skipImpassable: true,
};

const DISEASE_CLOUD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="22" cy="36" r="13" fill="#5f7a3a" opacity="0.8"/>
  <circle cx="38" cy="28" r="15" fill="#7a9a48" opacity="0.8"/>
  <circle cx="42" cy="42" r="12" fill="#4a5f2c" opacity="0.85"/>
  <circle cx="30" cy="30" r="5" fill="#c8d6a0" opacity="0.45"/>
</svg>`;

function resolveAim(ctx: CastBehaviourSetupContext): Point | null {
    const aim = findMeleeAimPixelInTargets(ctx.allTargets);
    if (aim) return aim;
    if (ctx.target?.type === 'pixel' && ctx.target.position) return ctx.target.position;
    return getPixelTargetPosition(ctx.allTargets, 0);
}

function cloudCellsAt(point: Point) {
    return cellsAroundPoint(point, tileShapes.square(DISEASE_CLOUD_CELL_RADIUS));
}

/** Fires the projectile line: one lob per landing point, each aimed through the inner launch. */
class DiseaseCloudVolley implements CastBehaviour {
    readonly handlesOnProjectileHit = true as const;
    constructor(private readonly inner: ProjectileLaunchBehaviour) {}

    onSetup(ctx: CastBehaviourSetupContext): void {
        const aim = resolveAim(ctx);
        if (!aim) return;
        const origin = { x: ctx.caster.x, y: ctx.caster.y };
        const lineFor = (side: LineSide) =>
            resolveAngledLine(origin, aim, {
                angleRad: DISEASE_CLOUD_ANGLE_RAD,
                side,
                count: DISEASE_CLOUD_PROJECTILE_COUNT,
                spacing: DISEASE_CLOUD_SPACING,
                minDistance: MIN_LANDING_DISTANCE,
            });

        // Take the side with less miasma already on it; an even split is decided by the engine RNG.
        const layers = ctx.engine.terrainLayers;
        const gassedCells = (side: LineSide): number =>
            lineFor(side)
                .flatMap(cloudCellsAt)
                .filter(({ col, row }) => layers?.getAirEffectAt(col, row)?.effectType === MIASMA_EFFECT_TYPE).length;
        const side = pickLeastCoveredSide(gassedCells, () => (ctx.engine.generateRandomInteger(0, 1) === 0 ? -1 : 1));

        for (const position of lineFor(side)) {
            const target: ResolvedTarget = { type: 'pixel', position };
            this.inner.onSetup({ ...ctx, target, allTargets: [target] });
        }
    }
}

export const DiseaseCloudAbility: AbilityStatic = defineAbility({
    id: DISEASE_CLOUD_ABILITY_ID,
    name: 'Disease Cloud',
    image: DISEASE_CLOUD_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: LAUNCH_END,
    abilityTimings: [
        { id: 'windup', start: 0, end: WINDUP_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'launch',
            start: WINDUP_TIME,
            end: LAUNCH_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: new DiseaseCloudVolley(
                CastBehaviours.ProjectileLaunch()
                    .withSpeed(PROJECTILE_SPEED)
                    .withMaxRange(MAX_PROJECTILE_RANGE)
                    .withRadius(PROJECTILE_RADIUS)
                    .withProjectileType('bramble_spike')
                    // Lobbed: the glob flies over units and does its work where it lands.
                    .withPassThroughEnemies()
                    .withArcHeight(ARC_HEIGHT),
            ),
        },
        { id: 'cooldown', start: LAUNCH_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: {
        minRange: DISEASE_CLOUD_MIN_AI_RANGE,
        maxRange: DISEASE_CLOUD_TARGETING_RANGE,
        maxUsesPerRound: MAX_USES,
        // Above Husk Grasp (default 0): at range the Husk fences the target in; up close it grasps.
        priority: 1,
    },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: DISEASE_CLOUD_TARGETING_RANGE }),

    getTooltipText(): string[] {
        return [
            `Lob {${DISEASE_CLOUD_PROJECTILE_COUNT}} globs in a line beside the target, each leaving a 3x3 cloud of miasma for {${DISEASE_CLOUD_DURATION_SEC}s} and dealing {${DISEASE_CLOUD_DAMAGE}} damage to enemies it lands on`,
            'Favours the side with less miasma, closing in on the target over repeated casts',
        ];
    },

    onProjectileExpired(engine: unknown, caster: Unit, projectile: unknown): void {
        const eng = engine as EngineContext;
        const proj = projectile as Projectile;
        // Snap the landing to its tile: damage and cloud share one 3x3 footprint.
        const landing = tileCentre(worldToTile(proj.x, proj.y));

        damageEnemiesInTiles({
            engine: eng,
            caster,
            tiles: cloudCellsAt(landing),
            origin: landing,
            damage: DISEASE_CLOUD_DAMAGE,
            abilityId: DISEASE_CLOUD_ABILITY_ID,
            attackType: 'melee',
        });
        placeTerrain(caster, DISEASE_CLOUD_PATCH, eng, landing);
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
});

export const DiseaseCloudCard: CardDef = {
    abilityId: DISEASE_CLOUD_ABILITY_ID,
};
