/**
 * Gather Stone — Earth Core ground ability. The caster marks a 3x3 tile patch up to
 * two tiles away and, half a second later, cracks every intact rock tile in it for a
 * fixed durability hit, banking one rock pebble per tile (and feeding Resonance to
 * nearby Earth allies for free via the stone-damage event). The "Grinding Debris"
 * research node adds a bite: enemies standing on rubble in the patch take 6 damage,
 * once each. It is stationary space control that turns cleared ground into pressure.
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
import { areEnemies } from '../../../game/teams';
import { tileAreaHitbox, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import { getUnitsInTiles, type TileCoord } from '../../../abilities/tileAreaHelpers';
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

const TIMINGS: AbilityTimingInterval[] = [
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
    },
    {
        id: 'cooldown',
        start: GATHER_STONE_PREFIRE + 0.1,
        end: GATHER_STONE_CAST_TIME,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

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
    abilityTimings: TIMINGS,
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

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (!(prevTime < GATHER_STONE_PREFIRE && currentTime >= GATHER_STONE_PREFIRE)) return;
        const eng = engine as AbilityEngineContext;
        const tm = eng.terrainManager;
        if (!tm) return;
        const pixel = getPixelTargetPosition(targets, 0);
        if (!pixel) return;

        const cells = GATHER_STONE_HITBOX.resolveCells(caster, pixel);

        // --- Rock harvest -----------------------------------------------------
        // Pre-check intact rock: damageRock's return value is null unless a
        // crack-tier change or destroy happens, so it can't tell us "was damaged".
        // isIntactRockAt is false out of bounds, so edge-of-map voids grant no phantom rock.
        const rockResource = caster.getResource('rock');
        const damagedRockCells: TileCoord[] = [];
        for (const cell of cells) {
            if (!tm.isIntactRockAt(cell.col, cell.row)) continue;
            tm.damageRock(cell.col, cell.row, GATHER_STONE_ROCK_DAMAGE, caster.id);
            damagedRockCells.push(cell);
            rockResource?.add(GATHER_STONE_ROCK_RESOURCE_PER_TILE);
        }

        // --- Grinding Debris (research node 2) -------------------------------
        if (casterHasResearchNode(eng, caster, EARTH_NODE_GATHER_STONE_RUBBLE_STRIKE)) {
            const isEnemyOfCaster = (unit: Unit): boolean => unit.isAlive() && areEnemies(caster.teamId, unit.teamId);
            for (const cell of cells) {
                if (!tm.isInBounds(cell.col, cell.row)) continue;
                if (tm.getEffectiveTerrainType(cell.col, cell.row) !== TerrainType.Rubble) continue;
                // Per cell, in cell order, so hits land in the same order as before. A unit's
                // centre sits in exactly one tile, so no unit is hit twice.
                for (const unit of getUnitsInTiles(eng.units, [cell], isEnemyOfCaster)) {
                    // Flat, unblockable environment-style hit; return value unused (see 0532).
                    unit.takeDamage(GATHER_STONE_RUBBLE_DAMAGE, caster.id, eng.eventBus);
                    spawnGatherStoneRubbleClash(eng, unit.x, unit.y);
                }
            }
        }

        spawnGatherStoneRockImpacts(eng, caster, damagedRockCells);
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
        const elapsed = gameTime - activeAbility.startTime;
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
