/**
 * Stone Tomb — Earth Core two-stage ground ability. After a 0.5s windup the caster picks a tile;
 * the target tile and its four orthogonal neighbours (a plus sign) are telegraphed in red.
 *
 * Stage 1 (on target pick): enemies in the centre tile take 10 damage and all units there (allies
 * undamaged) are knocked back away from the centre of that tile, then a rock is raised there.
 * Stage 2 (0.25s later, no new target): enemies in any tile of the plus take 6 damage, then
 * rocks are raised on the four outer tiles (the centre rock is not respawned).
 *
 * Timeline (seconds):
 *   0.00-0.50   windup
 *   0.50-0.517  pick the tomb tile (one-tick interactive select; enters on the tick after the gate tick)
 *   0.517-0.75  stage 1: damage, knockback and the centre rock (one-shot on entry)
 *   0.75-0.85   stage 2: damage and the outer rocks (one-shot on entry)
 *   0.85-1.50   cooldown
 */

import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import { Effect } from '../../../game/effects/Effect';
import { areEnemies } from '../../../game/teams';
import { type CardDef } from '../../types';
import { tileAreaHitbox, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import { getUnitsInTiles, tileCentre, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { drawTileAreaTelegraph } from '../../../abilities/previewHelpers';
import { TELEGRAPH_STYLES } from '../../../abilities/telegraphStyles';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import {
    STONE_TOMB_MAX_TILE_OFFSET,
    STONE_TOMB_CAST_RANGE,
    STONE_TOMB_STAGE1_TIME,
    STONE_TOMB_AIM_END,
    STONE_TOMB_STAGE_GAP,
    STONE_TOMB_STAGE1_DAMAGE,
    STONE_TOMB_STAGE2_DAMAGE,
    STONE_TOMB_KNOCKBACK_TIER,
    STONE_TOMB_CAST_TIME,
    STONE_TOMB_RECHARGE_TURNS,
} from '../earthCoreConstants';

const ABILITY_ID = '0530';
const TOMB_LABEL = 'Tomb location';
const STAGE2_TIME = STONE_TOMB_STAGE1_TIME + STONE_TOMB_STAGE_GAP;
const STAGE_ACTIVE_DURATION = 0.1;

const IMPACT_COLOR = 0x27d3c8;

const STONE_TOMB_HITBOX = tileAreaHitbox({
    anchor: { kind: 'chebyshev', maxTileOffset: STONE_TOMB_MAX_TILE_OFFSET },
    shape: tileShapes.plus(),
    castRange: STONE_TOMB_CAST_RANGE,
    style: TELEGRAPH_STYLES.danger,
});

const STONE_TOMB_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="8" width="28" height="24" rx="4" fill="#6b6b6b"/>
  <path d="M10 14 L30 14 M10 20 L30 20 M10 26 L30 26" stroke="#bdbdbd" stroke-width="2"/>
</svg>`;

type Point = { x: number; y: number };

function pixelOf(target: ResolvedTarget | undefined): Point | null {
    return target?.type === 'pixel' && target.position ? target.position : null;
}

/** The tomb pick: by label (interactive runs), falling back to its positional slot (committed runs). */
function tombPickPosition(active: ActiveAbility): Point | null {
    return pixelOf(active.targetsByLabel?.[TOMB_LABEL] ?? active.targets[0]);
}

/** Enemies (or allies, when `enemies` is false) standing on any of `tiles`, alive only. */
function unitsOnTiles(engine: AbilityEngineContext, caster: Unit, tiles: TileCoord[], enemies: boolean): Unit[] {
    return getUnitsInTiles(engine.units, tiles, (unit) =>
        unit.isAlive() && areEnemies(caster.teamId, unit.teamId) === enemies,
    );
}

function spawnTileImpact(engine: AbilityEngineContext, tile: TileCoord): void {
    const { x, y } = tileCentre(tile);
    engine.addEffect(new Effect({
        x,
        y,
        duration: 0.2,
        effectType: 'Explosion',
        effectRadius: CELL_SIZE / 2,
        effectProperties: { color: IMPACT_COLOR, direction: 'contract' },
    }));
}

/** Stage 1: centre-tile damage and knockback for everyone there, then the centre rock. */
function stageOne(ctx: CastBehaviourTickContext): void {
    const aim = pixelOf(ctx.target);
    if (!aim) return;
    const center = STONE_TOMB_HITBOX.resolveAnchor(ctx.caster, aim);
    if (!center) return;

    const engine = ctx.engine;
    const caster = ctx.caster;
    const centerWorld = tileCentre(center);
    // knockbackCtxFromEngine carries the engine's interrupt hook, so knocked-back units lose their casts.
    const knockbackCtx = knockbackCtxFromEngine(engine);
    const knockback = (unit: Unit): void => {
        tryApplyKnockbackByTier(
            unit, STONE_TOMB_KNOCKBACK_TIER,
            { unitId: caster.id, abilityId: ABILITY_ID },
            centerWorld.x, centerWorld.y,
            knockbackCtx,
        );
    };
    for (const unit of unitsOnTiles(engine, caster, [center], true)) {
        // Flat, unblockable environment-style hit; return value unused (see 0532).
        unit.takeDamage(STONE_TOMB_STAGE1_DAMAGE, caster.id, engine.eventBus);
        knockback(unit);
    }
    // Allies (and the caster) standing in the centre tile are shoved clear too, undamaged.
    for (const unit of unitsOnTiles(engine, caster, [center], false)) knockback(unit);
    engine.terrainManager?.createOrMarkRock(center.col, center.row);
    spawnTileImpact(engine, center);
}

/** Stage 2: damage across the plus, then the four outer rocks. The centre rock came from stage 1. */
function stageTwo(ctx: CastBehaviourTickContext): void {
    const aim = pixelOf(ctx.target);
    if (!aim) return;
    const cells = STONE_TOMB_HITBOX.resolveCells(ctx.caster, aim);
    if (cells.length === 0) return;

    const engine = ctx.engine;
    for (const unit of unitsOnTiles(engine, ctx.caster, cells, true)) {
        unit.takeDamage(STONE_TOMB_STAGE2_DAMAGE, ctx.caster.id, engine.eventBus);
    }
    // cells[0] is the centre (plus() puts it first), whose rock was already raised in stage 1.
    for (const cell of cells.slice(1)) {
        engine.terrainManager?.createOrMarkRock(cell.col, cell.row);
        spawnTileImpact(engine, cell);
    }
}

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: STONE_TOMB_STAGE1_TIME, abilityPhase: AbilityPhase.Windup },
    {
        // The plus-sign target is chosen here. Gated: it enters one tick after the gate tick.
        id: 'pickTomb',
        start: STONE_TOMB_STAGE1_TIME,
        end: STONE_TOMB_AIM_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: TOMB_LABEL,
            hitbox: STONE_TOMB_HITBOX,
            filter: 'any',
            allowMiss: true,
        },
    },
    {
        id: 'stage1',
        start: STONE_TOMB_AIM_END,
        end: STAGE2_TIME,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'hit', labels: [TOMB_LABEL] },
        castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(stageOne) }],
    },
    {
        id: 'stage2',
        start: STAGE2_TIME,
        end: STAGE2_TIME + STAGE_ACTIVE_DURATION,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'hit', labels: [TOMB_LABEL] },
        castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(stageTwo) }],
    },
    { id: 'cooldown', start: STAGE2_TIME + STAGE_ACTIVE_DURATION, end: STONE_TOMB_CAST_TIME, abilityPhase: AbilityPhase.Cooldown },
];

export const StoneTomb: AbilityStatic = defineAbility({
    id: ABILITY_ID,
    name: 'Stone Tomb',
    image: STONE_TOMB_IMAGE,
    tags: ['Entombed'],
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: STONE_TOMB_RECHARGE_TURNS,
    prefireTime: STONE_TOMB_STAGE1_TIME,
    abilityTimings: TIMINGS,
    targets: [],
    movementLock: { until: STAGE2_TIME },
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

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= STAGE2_TIME) return;
        const aim = tombPickPosition(activeAbility);
        if (!aim) return;
        drawTileAreaTelegraph(gr, STONE_TOMB_HITBOX.resolveCells(caster, aim), TELEGRAPH_STYLES.danger);
    },
});

export const StoneTombCard: CardDef = {
    abilityId: ABILITY_ID,
};
