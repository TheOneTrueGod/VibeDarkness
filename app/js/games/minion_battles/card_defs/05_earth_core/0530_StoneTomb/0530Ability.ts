/**
 * Stone Tomb — Earth Core two-stage ground ability. The caster winds up, shaking, with rock chips
 * hopping at their feet. Just before the first punch lands they pick a tile: the target tile and its
 * four orthogonal neighbours (a plus sign) are telegraphed in red and rumble. Then the caster punches
 * once, for the centre hit.
 *
 * Stage 1 (the punch): enemies in the centre tile take 15 damage and all units there (allies
 * undamaged) are knocked back away from the centre of that tile, then a rock is raised there.
 * Stage 2 (0.3s later, no punch): enemies in any tile of the plus take 9 damage, then the four
 * outer tiles become gravel (Rubble). Only the centre is rock.
 *
 * Costs 2 rock; 2 uses per round. Centre may sit up to 6 tiles (Chebyshev) from the caster.
 *
 * Timeline (seconds):
 *   0.00-0.85   windup: caster shakes, rock chips hop on the caster's tile
 *   0.85-0.867  pick the tomb tile (gated one-tick select: ITS pauses here, as late as possible)
 *   0.867-1.00  punch 1 slide-in; the marked tiles rumble
 *   1.00        stage 1: damage, knockback and the centre rock; punch 1 slide-out to 1.15
 *   1.15-1.30   pause (the caster stays still)
 *   1.30        stage 2: damage and the outer gravel (no punch)
 *   1.45-2.00   cooldown
 */

import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type {
    CastBehaviourBaseContext,
    CastBehaviourEntry,
    CastBehaviourTickContext,
} from '../../../abilities/castBehaviourTypes';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import { Effect } from '../../../game/effects/Effect';
import { areEnemies } from '../../../game/teams';
import { type CardDef } from '../../types';
import { tileAreaHitbox, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import { getUnitsInTiles, tileCentre, worldToTile, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { drawTileAreaTelegraph } from '../../../abilities/previewHelpers';
import { TELEGRAPH_STYLES } from '../../../abilities/telegraphStyles';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TERRAIN_CLEARS, clearTerrainEffects } from '../../../game/terrainEffects/terrainClearing';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import {
    STONE_TOMB_MAX_TILE_OFFSET,
    STONE_TOMB_CAST_RANGE,
    STONE_TOMB_PICK_TIME,
    STONE_TOMB_PICK_END,
    STONE_TOMB_STAGE1_TIME,
    STONE_TOMB_STAGE_GAP,
    STONE_TOMB_PUNCH_LEAD,
    STONE_TOMB_PUNCH_DISTANCE,
    STONE_TOMB_STAGE1_DAMAGE,
    STONE_TOMB_STAGE2_DAMAGE,
    STONE_TOMB_KNOCKBACK_TIER,
    STONE_TOMB_CAST_TIME,
    STONE_TOMB_RECHARGE_TURNS,
    STONE_TOMB_MAX_USES,
    STONE_TOMB_ROCK_COST,
} from '../earthCoreConstants';
import { stoneTombRumble } from './stoneTombVfx';
import { getCastElapsedAt } from '../../../game/time/actorClock';

const ABILITY_ID = '0530';
const TOMB_LABEL = 'Tomb location';
const STAGE2_TIME = STONE_TOMB_STAGE1_TIME + STONE_TOMB_STAGE_GAP;
/** End of the stage-2 window (the caster stays planted until here); cooldown starts here. */
const PUNCHES_END = STAGE2_TIME + STONE_TOMB_PUNCH_LEAD;

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

/** Erases ground effects (any team) from the struck tiles. No-op on engine stubs without terrain layers. */
function scourTiles(engine: AbilityEngineContext, caster: Unit, tiles: TileCoord[]): void {
    if (!engine.terrainLayers) return;
    clearTerrainEffects(
        { terrainLayers: engine.terrainLayers, eventBus: engine.eventBus },
        tiles,
        TERRAIN_CLEARS.scour,
        { unitId: caster.id, abilityId: ABILITY_ID },
    );
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
    scourTiles(engine, caster, [center]);
    engine.terrainManager?.createOrMarkRock(center.col, center.row);
    spawnTileImpact(engine, center);
}

/**
 * Stage 2: damage across the plus, then gravel (Rubble) on the four outer tiles. Only the centre is
 * rock, raised in stage 1. Outer tiles that are already rock or impassable are left as they are.
 */
function stageTwo(ctx: CastBehaviourTickContext): void {
    const aim = pixelOf(ctx.target);
    if (!aim) return;
    const cells = STONE_TOMB_HITBOX.resolveCells(ctx.caster, aim);
    if (cells.length === 0) return;

    const engine = ctx.engine;
    for (const unit of unitsOnTiles(engine, ctx.caster, cells, true)) {
        unit.takeDamage(STONE_TOMB_STAGE2_DAMAGE, ctx.caster.id, engine.eventBus);
    }
    scourTiles(engine, ctx.caster, cells);
    // cells[0] is the centre (plus() puts it first), whose rock was raised in stage 1.
    for (const cell of cells.slice(1)) {
        engine.terrainManager?.createRubble(cell.col, cell.row);
        spawnTileImpact(engine, cell);
    }
}

/** The plus cells a cast target points at (empty when the target is not a pixel). */
function tombCellsOf(ctx: CastBehaviourTickContext): TileCoord[] {
    const aim = pixelOf(ctx.target);
    return aim ? STONE_TOMB_HITBOX.resolveCells(ctx.caster, aim) : [];
}

/** The caster's own tile: where the windup rumbles, since the tomb is not picked yet. */
function casterTileOf(ctx: CastBehaviourTickContext): TileCoord[] {
    return [worldToTile(ctx.caster.x, ctx.caster.y)];
}

/** Render-only punch direction: from the caster toward the centre of the tomb tile. */
function punchDirection(ctx: CastBehaviourBaseContext): Point | null {
    const aim = pixelOf(ctx.target);
    const center = aim ? STONE_TOMB_HITBOX.resolveAnchor(ctx.caster, aim) : null;
    if (!center) return null;
    const c = tileCentre(center);
    const dx = c.x - ctx.caster.x;
    const dy = c.y - ctx.caster.y;
    const len = Math.hypot(dx, dy);
    return len > 0 ? { x: dx / len, y: dy / len } : null;
}

/** Slide toward the tomb over a whole window (impact at the window end). */
const punchIn = (): CastBehaviourEntry => ({
    timingStart: 'start',
    timingEnd: 'end',
    behaviour: CastBehaviours.CasterSlide({
        forwardDistance: STONE_TOMB_PUNCH_DISTANCE,
        backwardDistance: 0,
        impactAt: 1,
        direction: punchDirection,
    }),
});

/** Slide back from the tomb over a whole window (impact at the window start). */
const punchOut = (): CastBehaviourEntry => ({
    timingStart: 'start',
    timingEnd: 'end',
    behaviour: CastBehaviours.CasterSlide({
        forwardDistance: STONE_TOMB_PUNCH_DISTANCE,
        backwardDistance: 0,
        impactAt: 0,
        direction: punchDirection,
    }),
});

/** Every interval after the pick reuses the tomb pick as its target. */
const TOMB_HIT: AbilityTimingInterval['targetDef'] = { kind: 'hit', labels: [TOMB_LABEL] };

const TIMINGS: AbilityTimingInterval[] = [
    {
        // No target yet: the tomb is picked at the end of the windup.
        id: 'windup',
        start: 0,
        end: STONE_TOMB_PICK_TIME,
        abilityPhase: AbilityPhase.Windup,
        castBehaviours: [
            { timingStart: 'start', timingEnd: 'end', behaviour: CastBehaviours.CasterShake({ from: 1, to: 3 }) },
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: stoneTombRumble(STONE_TOMB_PICK_TIME, casterTileOf),
            },
        ],
    },
    {
        // The plus-sign target is chosen as late as possible, just before stage 1 (STONE_TOMB_PICK_TIME).
        // Gated: the cast is processed up to here first, then ITS pauses before the select enters.
        id: 'pickTomb',
        start: STONE_TOMB_PICK_TIME,
        end: STONE_TOMB_PICK_END,
        abilityPhase: AbilityPhase.Active,
        targetDef: {
            kind: 'select',
            label: TOMB_LABEL,
            hitbox: STONE_TOMB_HITBOX,
            filter: 'any',
            allowMiss: true,
        },
    },
    {
        // Nothing has landed yet, so an interrupt here still refunds (no doNotRefund).
        id: 'punch1',
        start: STONE_TOMB_PICK_END,
        end: STONE_TOMB_STAGE1_TIME,
        abilityPhase: AbilityPhase.Active,
        targetDef: TOMB_HIT,
        castBehaviours: [
            punchIn(),
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: stoneTombRumble(STONE_TOMB_STAGE1_TIME - STONE_TOMB_PICK_END, tombCellsOf),
            },
        ],
    },
    {
        id: 'stage1',
        start: STONE_TOMB_STAGE1_TIME,
        end: STONE_TOMB_STAGE1_TIME + STONE_TOMB_PUNCH_LEAD,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: TOMB_HIT,
        castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(stageOne) }, punchOut()],
    },
    {
        // The gap before stage 2. The caster stays put: only the centre hit (stage 1) has a punch.
        id: 'punch2',
        start: STONE_TOMB_STAGE1_TIME + STONE_TOMB_PUNCH_LEAD,
        end: STAGE2_TIME,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: TOMB_HIT,
    },
    {
        id: 'stage2',
        start: STAGE2_TIME,
        end: PUNCHES_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: TOMB_HIT,
        castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(stageTwo) }],
    },
    { id: 'cooldown', start: PUNCHES_END, end: STONE_TOMB_CAST_TIME, abilityPhase: AbilityPhase.Cooldown },
];

export const StoneTomb: AbilityStatic = defineAbility({
    id: ABILITY_ID,
    name: 'Stone Tomb',
    image: STONE_TOMB_IMAGE,
    tags: ['Entombed'],
    resourceCost: { resourceId: 'rock', amount: STONE_TOMB_ROCK_COST },
    rechargeTurns: STONE_TOMB_RECHARGE_TURNS,
    maxUses: STONE_TOMB_MAX_USES,
    prefireTime: STONE_TOMB_STAGE1_TIME,
    abilityTimings: TIMINGS,
    targets: [],
    movementLock: { until: PUNCHES_END },
    aiSettings: { minRange: 0, maxRange: STONE_TOMB_CAST_RANGE },

    getRange(): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: STONE_TOMB_CAST_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Stones erupt out of the ground, dealing {${STONE_TOMB_STAGE1_DAMAGE}} damage to enemies in the centre, and {${STONE_TOMB_STAGE2_DAMAGE}} to enemies farther away`,
        ];
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = getCastElapsedAt(activeAbility, gameTime);
        if (elapsed >= STAGE2_TIME) return;
        const aim = tombPickPosition(activeAbility);
        if (!aim) return;
        drawTileAreaTelegraph(gr, STONE_TOMB_HITBOX.resolveCells(caster, aim), TELEGRAPH_STYLES.danger);
    },
});

export const StoneTombCard: CardDef = {
    abilityId: ABILITY_ID,
};
