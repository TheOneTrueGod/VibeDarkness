/**
 * Stone Tomb — Earth Core two-stage ground ability. After a 0.5s windup the caster picks a tile;
 * the target tile and its four orthogonal neighbours (a plus sign) are telegraphed in red.
 *
 * Stage 1 (on target pick): enemies in the centre tile take 10 damage and all units there (allies
 * undamaged) are knocked back away from the centre of that tile, then a rock is raised there.
 * Stage 2 (0.25s later, no new target): enemies in any tile of the plus take 6 damage, then
 * rocks are raised on the four outer tiles (the centre rock is not respawned).
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
import type { EventBus } from '../../../game/EventBus';
import { Effect } from '../../../game/effects/Effect';
import { areEnemies } from '../../../game/teams';
import { type CardDef } from '../../types';
import { plusTileAreaHitbox } from '../../../hitboxes/PlusTileAreaHitboxSpec';
import {
    snapSquareTileAreaCenter,
    getPlusTileAreaCells,
    drawPlusTileArea,
    worldToTile,
    type TileCoord,
} from '../../../abilities/tileAreaHelpers';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import {
    STONE_TOMB_MAX_TILE_OFFSET,
    STONE_TOMB_CAST_RANGE,
    STONE_TOMB_STAGE1_TIME,
    STONE_TOMB_STAGE_GAP,
    STONE_TOMB_STAGE1_DAMAGE,
    STONE_TOMB_STAGE2_DAMAGE,
    STONE_TOMB_KNOCKBACK_TIER,
    STONE_TOMB_CAST_TIME,
    STONE_TOMB_RECHARGE_TURNS,
} from '../earthCoreConstants';

const ABILITY_ID = '0530';
const STAGE2_TIME = STONE_TOMB_STAGE1_TIME + STONE_TOMB_STAGE_GAP;
const STAGE_ACTIVE_DURATION = 0.1;

const PREVIEW_STYLE = { color: 0xff2a2a, lineWidth: 2, fillAlpha: 0.12, strokeAlpha: 0.9 } as const;
const IMPACT_COLOR = 0x27d3c8;

const STONE_TOMB_HITBOX = plusTileAreaHitbox({
    maxTileOffset: STONE_TOMB_MAX_TILE_OFFSET,
    castRange: STONE_TOMB_CAST_RANGE,
    previewStyle: PREVIEW_STYLE,
});

const STONE_TOMB_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="8" width="28" height="24" rx="4" fill="#6b6b6b"/>
  <path d="M10 14 L30 14 M10 20 L30 20 M10 26 L30 26" stroke="#bdbdbd" stroke-width="2"/>
</svg>`;

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: STONE_TOMB_STAGE1_TIME, abilityPhase: AbilityPhase.Windup },
    {
        // Stage 1. The plus-sign target is chosen here (deferred select at windup end).
        id: 'stage1',
        start: STONE_TOMB_STAGE1_TIME,
        end: STAGE2_TIME,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: 'Tomb location',
            hitbox: STONE_TOMB_HITBOX,
            filter: 'any',
            allowMiss: true,
        },
    },
    {
        id: 'stage2',
        start: STAGE2_TIME,
        end: STAGE2_TIME + STAGE_ACTIVE_DURATION,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
    },
    { id: 'cooldown', start: STAGE2_TIME + STAGE_ACTIVE_DURATION, end: STONE_TOMB_CAST_TIME, abilityPhase: AbilityPhase.Cooldown },
];

interface EngineLike {
    units: Unit[];
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    getUnit(id: string): Unit | undefined;
    addEffect(effect: unknown): void;
    terrainManager?: {
        createOrMarkRock(col: number, row: number): unknown;
    } | null;
}

function getPixelTargetPosition(targets: ResolvedTarget[], index: number = 0): { x: number; y: number } | null {
    const target = targets[index];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

function tileCenterWorld(tile: TileCoord): { x: number; y: number } {
    return { x: (tile.col + 0.5) * CELL_SIZE, y: (tile.row + 0.5) * CELL_SIZE };
}

function resolveCenter(caster: Unit, targets: ResolvedTarget[]): TileCoord | null {
    const pixel = getPixelTargetPosition(targets, 0);
    if (!pixel) return null;
    return snapSquareTileAreaCenter(caster.x, caster.y, pixel.x, pixel.y, STONE_TOMB_MAX_TILE_OFFSET);
}

function unitsInTiles(eng: EngineLike, caster: Unit, tiles: TileCoord[], enemies: boolean): Unit[] {
    return eng.units.filter((unit) => {
        if (!unit.isAlive() || areEnemies(caster.teamId, unit.teamId) !== enemies) return false;
        const ut = worldToTile(unit.x, unit.y);
        return tiles.some((t) => t.col === ut.col && t.row === ut.row);
    });
}

function spawnTileImpact(eng: EngineLike, tile: TileCoord): void {
    const { x, y } = tileCenterWorld(tile);
    eng.addEffect(new Effect({
        x,
        y,
        duration: 0.2,
        effectType: 'Explosion',
        effectRadius: CELL_SIZE / 2,
        effectProperties: { color: IMPACT_COLOR, direction: 'contract' },
    }));
}

function stage1(eng: EngineLike, caster: Unit, center: TileCoord): void {
    const centerWorld = tileCenterWorld(center);
    const knockback = (unit: Unit): void => {
        tryApplyKnockbackByTier(
            unit, STONE_TOMB_KNOCKBACK_TIER,
            { unitId: caster.id, abilityId: ABILITY_ID },
            centerWorld.x, centerWorld.y,
            { gameTime: eng.gameTime, roundNumber: eng.roundNumber ?? 1, eventBus: eng.eventBus },
        );
    };
    for (const unit of unitsInTiles(eng, caster, [center], true)) {
        // Flat, unblockable environment-style hit; return value unused (see 0532).
        unit.takeDamage(STONE_TOMB_STAGE1_DAMAGE, caster.id, eng.eventBus);
        knockback(unit);
    }
    // Allies (and the caster) standing in the centre tile are shoved clear too, undamaged.
    for (const unit of unitsInTiles(eng, caster, [center], false)) knockback(unit);
    eng.terrainManager?.createOrMarkRock(center.col, center.row);
    spawnTileImpact(eng, center);
}

function stage2(eng: EngineLike, caster: Unit, center: TileCoord): void {
    const cells = getPlusTileAreaCells(center);
    for (const unit of unitsInTiles(eng, caster, cells, true)) {
        unit.takeDamage(STONE_TOMB_STAGE2_DAMAGE, caster.id, eng.eventBus);
    }
    // cells[0] is the centre, whose rock was already raised in stage 1.
    for (const cell of cells.slice(1)) {
        eng.terrainManager?.createOrMarkRock(cell.col, cell.row);
        spawnTileImpact(eng, cell);
    }
}

export const StoneTomb: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Stone Tomb',
    image: STONE_TOMB_IMAGE,
    tags: ['Entombed'],
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: STONE_TOMB_RECHARGE_TURNS,
    prefireTime: STONE_TOMB_STAGE1_TIME,
    abilityTimings: TIMINGS,
    targets: [],
    aiSettings: { minRange: 0, maxRange: STONE_TOMB_CAST_RANGE },

    getRange(): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: STONE_TOMB_CAST_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Mark a plus-shaped patch of 5 tiles within ${STONE_TOMB_MAX_TILE_OFFSET} tiles`,
            `Stage 1: enemies in the centre tile take {${STONE_TOMB_STAGE1_DAMAGE}} damage and all units there are knocked back; a rock rises there`,
            `${STONE_TOMB_STAGE_GAP}s later, stage 2: enemies in any marked tile take {${STONE_TOMB_STAGE2_DAMAGE}} damage; rocks rise on the other 4 tiles`,
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < STAGE2_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const crossedStage1 = prevTime < STONE_TOMB_STAGE1_TIME && currentTime >= STONE_TOMB_STAGE1_TIME;
        const crossedStage2 = prevTime < STAGE2_TIME && currentTime >= STAGE2_TIME;
        if (!crossedStage1 && !crossedStage2) return;
        const center = resolveCenter(caster, targets);
        if (!center) return;
        const eng = engine as EngineLike;
        if (crossedStage1) stage1(eng, caster, center);
        if (crossedStage2) stage2(eng, caster, center);
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= STAGE2_TIME) return;
        const center = resolveCenter(caster, activeAbility.targets);
        if (!center) return;
        drawPlusTileArea(gr, center, PREVIEW_STYLE);
    },
};

export const StoneTombCard: CardDef = {
    abilityId: ABILITY_ID,
};
