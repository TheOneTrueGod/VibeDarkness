/**
 * Gather Stone — Earth Core ground ability. The caster marks a 3x3 tile patch up to
 * two tiles away and, half a second later, cracks every intact rock tile in it for a
 * fixed durability hit, banking one rock pebble per tile (and feeding Resonance to
 * nearby Earth allies for free via the stone-damage event). The "Grinding Debris"
 * research node adds a bite: enemies standing on rubble in the patch take 6 damage,
 * once each, and that hit can be blocked. It is stationary space control that turns cleared
 * ground into pressure.
 *
 * Built on `TerrainStrike` (the rock harvest) with no `doCardEffect`. Grinding Debris follows the
 * research-variant pattern of Throw Rock: `getAbilityTimings` returns the base timings, or the same
 * timings with a second behaviour attached to the gather window when the node is owned.
 */

import {
    AbilityState,
    type AbilityStatic,
    type AbilityStateEntry,
    type IAbilityPreviewGraphics,
} from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { type CardDef } from '../../types';
import { TerrainType } from '../../../terrain/TerrainType';
import { tileAreaHitbox, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import { tileCentre, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourEntry, CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { damageEnemiesInTiles } from '../../../abilities/targetHelpers';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { drawTileAreaTelegraph } from '../../../abilities/previewHelpers';
import { TELEGRAPH_STYLES } from '../../../abilities/telegraphStyles';
import { EARTH_TREE_ID, EARTH_NODE_GATHER_STONE_RUBBLE_STRIKE } from '../../../../../researchTrees/trees/earth';
import {
    GATHER_STONE_ROCK_DAMAGE,
    GATHER_STONE_ROCK_RESOURCE_PER_TILE,
    GATHER_STONE_RUBBLE_DAMAGE,
    GATHER_STONE_MAX_TILE_OFFSET,
    GATHER_STONE_AREA_HALF_TILES,
    GATHER_STONE_CAST_TIME,
    GATHER_STONE_PREFIRE,
    GATHER_STONE_CAST_RANGE,
    GATHER_STONE_RECHARGE_TURNS,
} from '../earthCoreConstants';
import {
    spawnGatherStonePullRing,
    spawnGatherStoneRockImpacts,
    spawnGatherStoneRubbleClash,
} from './gatherStoneVfx';
import { getCastElapsedAt } from '../../../game/time/actorClock';

const ABILITY_ID = '0536';

const GATHER_STONE_HITBOX = tileAreaHitbox({
    anchor: { kind: 'chebyshev', maxTileOffset: GATHER_STONE_MAX_TILE_OFFSET },
    shape: tileShapes.square(GATHER_STONE_AREA_HALF_TILES),
    castRange: GATHER_STONE_CAST_RANGE,
    style: TELEGRAPH_STYLES.earth,
    gridLines: true,
});

const GATHER_STONE_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="6" width="28" height="28" rx="3" fill="#3f2d1a" stroke="#b45309" stroke-width="2"/>
  <path d="M13 27 L18 15 L23 24 L27 12" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const MARK_INTERVAL = 1 / 60;

/** The patch of tiles the cast marked (the `mark` select's pixel, snapped by the hitbox), or none. */
function gatherCells(ctx: CastBehaviourTickContext): TileCoord[] {
    const pixel = getPixelTargetPosition([ctx.target], 0);
    return pixel ? GATHER_STONE_HITBOX.resolveCells(ctx.caster, pixel) : [];
}

/**
 * Rock harvest: every intact rock tile in the patch takes a fixed durability hit and banks rock
 * (feeding Resonance to nearby Earth allies for free via the stone-damage event).
 */
const gatherHarvest = CastBehaviours.TerrainStrike()
    .atTiles(gatherCells)
    .damageRock(GATHER_STONE_ROCK_DAMAGE)
    .onStruck((ctx, struck) => {
        ctx.caster.getResource('rock')?.add(struck.length * GATHER_STONE_ROCK_RESOURCE_PER_TILE);
        spawnGatherStoneRockImpacts(ctx.engine, ctx.caster, struck);
    });

/**
 * Grinding Debris: enemies standing on rubble in the patch take a hit that can be blocked. It runs
 * after the harvest, so rock the harvest just broke counts as rubble.
 */
const rubbleStrike = CastBehaviours.Instant((ctx) => {
    const tm = ctx.engine.terrainManager;
    const pixel = getPixelTargetPosition([ctx.target], 0);
    if (!tm || !pixel) return;
    const rubbleCells = gatherCells(ctx).filter((cell) =>
        tm.isInBounds(cell.col, cell.row) && tm.getEffectiveTerrainType(cell.col, cell.row) === TerrainType.Rubble);
    const anchor = GATHER_STONE_HITBOX.resolveAnchor(ctx.caster, pixel);
    const origin = anchor ? tileCentre(anchor) : { x: ctx.caster.x, y: ctx.caster.y };
    damageEnemiesInTiles({
        engine: ctx.engine,
        caster: ctx.caster,
        tiles: rubbleCells,
        origin,
        damage: GATHER_STONE_RUBBLE_DAMAGE,
        abilityId: ABILITY_ID,
        attackType: 'melee',
        onHit: (unit) => {
            const outcome = tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: origin.x,
                attackerY: origin.y,
                attackerId: ctx.caster.id,
                abilityId: ABILITY_ID,
                damage: GATHER_STONE_RUBBLE_DAMAGE,
                attackType: 'melee',
            });
            if (outcome.hit) spawnGatherStoneRubbleClash(ctx.engine, unit.x, unit.y);
        },
    });
});

function buildTimings(withRubbleStrike: boolean): AbilityTimingInterval[] {
    const gatherBehaviours: CastBehaviourEntry[] = [
        { timingStart: 'start', timingEnd: 'end', behaviour: gatherHarvest },
        ...(withRubbleStrike ? [{ timingStart: 'start', timingEnd: 'end', behaviour: rubbleStrike } as CastBehaviourEntry] : []),
    ];
    return [
        {
            // One-tick interactive select at t=0: the player marks the patch before any
            // cast time elapses (deferred-first-select), then the windup telegraphs it.
            // start:0 select intervals are Active-phase by convention (Claw, Dodge, Digging Claws).
            id: 'mark',
            start: 0,
            end: MARK_INTERVAL,
            abilityPhase: AbilityPhase.Active,
            targetDef: {
                kind: 'select',
                label: 'Gather area',
                hitbox: GATHER_STONE_HITBOX,
                filter: 'any',
                allowMiss: true,
            },
        },
        {
            id: 'windup',
            start: MARK_INTERVAL,
            end: GATHER_STONE_PREFIRE,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'gather',
            start: GATHER_STONE_PREFIRE,
            end: GATHER_STONE_PREFIRE + 0.1,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: gatherBehaviours,
        },
        {
            id: 'cooldown',
            start: GATHER_STONE_PREFIRE + 0.1,
            end: GATHER_STONE_CAST_TIME,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ];
}

const BASE_TIMINGS = buildTimings(false);
const RUBBLE_STRIKE_TIMINGS = buildTimings(true);

/** Pixel target position from resolved targets (mirrors the local helper in 0532). */
function getPixelTargetPosition(targets: ResolvedTarget[], index: number = 0): { x: number; y: number } | null {
    const target = targets[index];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

/** Inline research check (avoids importing abilityModifierHelpers -> AbilityRegistry). */
function casterHasResearchNode(eng: AbilityEngineContext, caster: Unit, nodeId: string): boolean {
    const ownerId = caster.ownerId ?? eng.localPlayerId ?? '';
    if (!ownerId || !eng.getPlayerResearchNodes) return false;
    return eng.getPlayerResearchNodes(ownerId, EARTH_TREE_ID).includes(nodeId);
}

export const GatherStoneAbility_0536: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Gather Stone',
    image: GATHER_STONE_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: GATHER_STONE_RECHARGE_TURNS,
    prefireTime: GATHER_STONE_PREFIRE,
    abilityTimings: BASE_TIMINGS,
    getAbilityTimings(caster?: Unit, gameState?: unknown): AbilityTimingInterval[] {
        const eng = gameState as AbilityEngineContext | undefined;
        return eng && caster && casterHasResearchNode(eng, caster, EARTH_NODE_GATHER_STONE_RUBBLE_STRIKE)
            ? RUBBLE_STRIKE_TIMINGS
            : BASE_TIMINGS;
    },
    targets: [],
    aiSettings: { minRange: 0, maxRange: GATHER_STONE_CAST_RANGE },

    getRange(): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: GATHER_STONE_CAST_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Mark a 3x3 patch of ground within ${GATHER_STONE_MAX_TILE_OFFSET} tiles`,
            `After ${GATHER_STONE_PREFIRE}s, crack each rock tile in the patch and bank ${GATHER_STONE_ROCK_RESOURCE_PER_TILE} rock per tile`,
            `Grinding Debris: enemies on rubble in the patch take {${GATHER_STONE_RUBBLE_DAMAGE}} damage`,
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < GATHER_STONE_PREFIRE) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    beginActiveCast(engine: unknown, caster: Unit): void {
        spawnGatherStonePullRing(engine as AbilityEngineContext, caster);
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        const cells = GATHER_STONE_HITBOX.resolveCells(caster, mouseWorld);
        drawTileAreaTelegraph(gr, cells, TELEGRAPH_STYLES.earth);
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = getCastElapsedAt(activeAbility, gameTime);
        if (elapsed >= GATHER_STONE_PREFIRE) return;
        const pixel = getPixelTargetPosition(activeAbility.targets, 0);
        if (!pixel) return;
        const cells = GATHER_STONE_HITBOX.resolveCells(caster, pixel);
        const t = Math.min(1, elapsed / GATHER_STONE_PREFIRE);
        drawTileAreaTelegraph(gr, cells, { ...TELEGRAPH_STYLES.earth, fillAlpha: 0.2 + 0.6 * t, strokeAlpha: 0.85 });
    },
};

export const GatherStoneCard: CardDef = {
    abilityId: ABILITY_ID,
};
