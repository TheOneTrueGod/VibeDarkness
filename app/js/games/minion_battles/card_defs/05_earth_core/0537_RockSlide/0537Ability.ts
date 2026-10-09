/**
 * Rock Slide — Earth Core ground ability. The caster rips a rock tile out of the ground within two
 * tiles, picks one of the four tiles next to them, and punches the rock down that line as a fast
 * projectile that damages the first five enemies, knocks every enemy it touches off to the side,
 * and comes to rest as a new rock tile.
 *
 * Timeline (seconds):
 *   0.00        pick the rock (interactive select; the shake starts on the windup)
 *   0.00-0.40   windup: caster shakes, chips fly from the rock into the caster
 *   0.40        the rock is destroyed (becomes rubble); the direction select starts here
 *   0.40-0.417  pick the direction (one-tick interactive select, entered on the tick after the gate
 *               tick; chips fly out of the caster)
 *   0.70        the rock projectile appears, held, on the picked tile
 *   0.70-1.00   punch: slide-in, then slide-out at launch
 *   0.85        the held projectile is released and flies
 *   1.00-1.40   cooldown
 *
 * Interrupts run through `interruptUnitAbilities`. The destroyed rock stays destroyed. A held
 * projectile is cancelled and its tile becomes rock (`withHold.onCancelled`). Once released it flies
 * on regardless, and an interrupt during cooldown ends the cast (`interruptPolicy`).
 */

import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { ProjectileLaunchBehaviour } from '../../../abilities/CastBehaviours/ProjectileLaunchBehaviour';
import type {
    CastBehaviourBaseContext,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../../../abilities/castBehaviourTypes';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import type { Projectile } from '../../../game/projectiles/Projectile';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { type CardDef } from '../../types';
import { tileCentre, worldToTile, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { drawArrow, drawTileAreaTelegraph } from '../../../abilities/previewHelpers';
import { TELEGRAPH_STYLES } from '../../../abilities/telegraphStyles';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    ROCK_SLIDE_ROCK_MAX_TILE_OFFSET,
    ROCK_SLIDE_CAST_RANGE,
    ROCK_SLIDE_PICK_END,
    ROCK_SLIDE_AIM_START,
    ROCK_SLIDE_AIM_END,
    ROCK_SLIDE_SPAWN_TIME,
    ROCK_SLIDE_LAUNCH_TIME,
    ROCK_SLIDE_SLIDE_END_TIME,
    ROCK_SLIDE_CAST_TIME,
    ROCK_SLIDE_PUNCH_DISTANCE,
    ROCK_SLIDE_DAMAGE,
    ROCK_SLIDE_MAX_DAMAGE_TARGETS,
    ROCK_SLIDE_KNOCKBACK_TIER,
    ROCK_SLIDE_TRAVEL_TILES,
    ROCK_SLIDE_PROJECTILE_SPEED,
    ROCK_SLIDE_PROJECTILE_RADIUS,
    ROCK_SLIDE_RECHARGE_TURNS,
} from '../earthCoreConstants';
import {
    ROCK_PICK_HITBOX,
    DIRECTION_PICK_HITBOX,
    resolveRockTile,
    resolveSlideDirection,
    isSlideSpawnTile,
} from './rockSlideHelpers';
import {
    spawnRockSlideInwardChips,
    spawnRockSlideOutwardChips,
    spawnRockSlideBreak,
    spawnRockSlideSettle,
} from './rockSlideVfx';

const ABILITY_ID = '0537';
const ROCK_LABEL = 'Rock';
const DIRECTION_LABEL = 'Direction';

/** Positional fallback index of the direction pick (the rock pick is index 0). */
const DIRECTION_TARGET_INDEX = 1;

/** Fraction of the punch window at which the caster reaches the rock (the launch). */
const PUNCH_IMPACT_AT = (ROCK_SLIDE_LAUNCH_TIME - ROCK_SLIDE_SPAWN_TIME) / (ROCK_SLIDE_SLIDE_END_TIME - ROCK_SLIDE_SPAWN_TIME);

const ROCK_SLIDE_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="9" width="22" height="22" rx="3" fill="#757575" stroke="#4a4a4a" stroke-width="2"/>
  <path d="M10 16 L16 22 L13 28" fill="none" stroke="#3c3c3c" stroke-width="2"/>
  <path d="M29 14 L36 20 L29 26" fill="none" stroke="#e5e7eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ---- Helpers ----

type Point = { x: number; y: number };

function terrainOf(engine: unknown): TerrainManager | null {
    return (engine as { terrainManager?: TerrainManager | null }).terrainManager ?? null;
}

function pixelOf(target: ResolvedTarget | undefined): Point | null {
    return target?.type === 'pixel' && target.position ? target.position : null;
}

/** The rock tile a cast target points at (rock pick), or null. */
function rockTileOf(caster: Unit, target: ResolvedTarget | undefined): TileCoord | null {
    const pos = pixelOf(target);
    return pos ? resolveRockTile(caster, pos) : null;
}

/** The direction pick a cast target points at (adjacent cardinal tile and unit direction), or null. */
function directionOf(caster: Unit, target: ResolvedTarget | undefined): ReturnType<typeof resolveSlideDirection> {
    const pos = pixelOf(target);
    return pos ? resolveSlideDirection(caster, pos) : null;
}

/**
 * A pick by label (interactive runs), falling back to its positional slot (committed runs).
 * Used for previews, which read the cast's targets directly.
 */
function pickPosition(active: ActiveAbility, label: string, index: number): Point | null {
    return pixelOf(active.targetsByLabel?.[label] ?? active.targets[index]);
}

/** Rock settling into the ground at a point, used when a held projectile is cancelled or lands. */
function settleRockAt(engine: AbilityEngineContext, x: number, y: number): void {
    const tile = worldToTile(x, y);
    engine.terrainManager?.createOrMarkRock(tile.col, tile.row);
    spawnRockSlideSettle(engine, x, y);
}

/** Step 2: the picked rock becomes rubble at the end of the windup. */
function destroyPickedRock(ctx: CastBehaviourTickContext): void {
    const tile = rockTileOf(ctx.caster, ctx.target);
    const tm = ctx.engine.terrainManager;
    if (!tile || !tm) return;
    if (tm.destroyRock(tile.col, tile.row, ctx.caster.id)) {
        const c = tileCentre(tile);
        spawnRockSlideBreak(ctx.engine, c.x, c.y);
    }
}

/** The held projectile: starts on the spawn tile, flies along the direction, and stops at walls. */
function rockLaunch(): ProjectileLaunchBehaviour {
    return CastBehaviours.ProjectileLaunch()
        .withProjectileType('rock_slide')
        .withRadius(ROCK_SLIDE_PROJECTILE_RADIUS)
        .withSpeed(ROCK_SLIDE_PROJECTILE_SPEED)
        .withMaxRange(ROCK_SLIDE_TRAVEL_TILES * CELL_SIZE)
        .withBaseDamage(ROCK_SLIDE_DAMAGE)
        .withHitPolicy({
            damagingHits: ROCK_SLIDE_MAX_DAMAGE_TARGETS,
            overflow: 'knockbackOnly',
            knockback: { tier: ROCK_SLIDE_KNOCKBACK_TIER, direction: { kind: 'sideOfTravel', angleDeg: 45 } },
        })
        .withModifiers(['stopsAtWalls'])
        .withOrigin((ctx: CastBehaviourSetupContext) => {
            const dir = directionOf(ctx.caster, ctx.target);
            return dir ? tileCentre(dir.tile) : { x: ctx.caster.x, y: ctx.caster.y };
        })
        .withDirection((ctx: CastBehaviourSetupContext) => {
            const dir = directionOf(ctx.caster, ctx.target);
            return dir ? { x: dir.dirCol, y: dir.dirRow } : null;
        })
        .withHold({
            onCancelled: (ctx, projectile) => settleRockAt(ctx.engine, projectile.x, projectile.y),
        });
}

/**
 * Render-only punch direction (the caster leans toward the picked tile). CasterSlide reads it once,
 * when the punch opens. The caster is still movement-locked then, so it is the same cardinal the held
 * launch uses, and walking after the launch cannot flip the slide-out.
 */
function punchDirection(ctx: CastBehaviourBaseContext): Point | null {
    const dir = directionOf(ctx.caster, ctx.target);
    return dir ? { x: dir.dirCol, y: dir.dirRow } : null;
}

const TIMINGS: AbilityTimingInterval[] = [
    {
        // One-tick select at t=0: the rock is chosen before any cast time elapses (deferred first select).
        id: 'pickRock',
        start: 0,
        end: ROCK_SLIDE_PICK_END,
        abilityPhase: AbilityPhase.Active,
        targetDef: {
            kind: 'select',
            label: ROCK_LABEL,
            hitbox: ROCK_PICK_HITBOX,
            filter: 'any',
            allowMiss: true,
            validatePick({ caster, engine, pick }) {
                const tm = terrainOf(engine);
                const tile = pick.type === 'pixel' && pick.position ? resolveRockTile(caster, pick.position) : null;
                return tm !== null && tile !== null && tm.isIntactRockAt(tile.col, tile.row);
            },
        },
    },
    {
        id: 'windup',
        start: ROCK_SLIDE_PICK_END,
        end: ROCK_SLIDE_AIM_START,
        abilityPhase: AbilityPhase.Windup,
        targetDef: { kind: 'hit', labels: [ROCK_LABEL] },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const tile = rockTileOf(ctx.caster, ctx.target);
                    if (tile) spawnRockSlideInwardChips(ctx.engine, ctx.caster, tileCentre(tile));
                }),
            },
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: CastBehaviours.CasterShake({ from: 1, to: 3 }),
            },
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: CastBehaviours.Instant(destroyPickedRock, { at: 'end' }),
            },
        ],
    },
    {
        id: 'pickDirection',
        start: ROCK_SLIDE_AIM_START,
        end: ROCK_SLIDE_AIM_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: DIRECTION_LABEL,
            hitbox: DIRECTION_PICK_HITBOX,
            filter: 'any',
            allowMiss: true,
            validatePick({ caster, engine, pick }) {
                const tm = terrainOf(engine);
                if (!tm || pick.type !== 'pixel' || !pick.position) return false;
                const dir = resolveSlideDirection(caster, pick.position);
                return dir != null && isSlideSpawnTile(tm, dir.tile);
            },
        },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const dir = directionOf(ctx.caster, ctx.target);
                    if (dir) spawnRockSlideOutwardChips(ctx.engine, ctx.caster, dir.dirCol, dir.dirRow);
                }),
            },
        ],
    },
    { id: 'charge', start: ROCK_SLIDE_AIM_END, end: ROCK_SLIDE_SPAWN_TIME, abilityPhase: AbilityPhase.Active, doNotRefund: true },
    {
        id: 'punch',
        start: ROCK_SLIDE_SPAWN_TIME,
        end: ROCK_SLIDE_SLIDE_END_TIME,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'hit', labels: [DIRECTION_LABEL] },
        castBehaviours: [
            {
                // The projectile is held from the start of the punch and released when the slide-in ends.
                timingStart: 'start',
                timingEnd: ROCK_SLIDE_LAUNCH_TIME - ROCK_SLIDE_SPAWN_TIME,
                targetIndex: DIRECTION_TARGET_INDEX,
                behaviour: rockLaunch(),
            },
            {
                timingStart: 'start',
                timingEnd: 'end',
                targetIndex: DIRECTION_TARGET_INDEX,
                behaviour: CastBehaviours.CasterSlide({
                    forwardDistance: ROCK_SLIDE_PUNCH_DISTANCE,
                    backwardDistance: 0,
                    impactAt: PUNCH_IMPACT_AT,
                    direction: punchDirection,
                }),
            },
        ],
    },
    { id: 'cooldown', start: ROCK_SLIDE_SLIDE_END_TIME, end: ROCK_SLIDE_CAST_TIME, abilityPhase: AbilityPhase.Cooldown },
];

// ---- Ability ----

export const RockSlideAbility_0537: AbilityStatic = defineAbility({
    id: ABILITY_ID,
    name: 'Rock Slide',
    image: ROCK_SLIDE_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: ROCK_SLIDE_RECHARGE_TURNS,
    prefireTime: ROCK_SLIDE_AIM_START,
    abilityTimings: TIMINGS,
    targets: [],
    movementLock: { until: ROCK_SLIDE_LAUNCH_TIME },
    interruptPolicy: { duringCooldown: 'end' },
    aiSettings: { minRange: 0, maxRange: ROCK_SLIDE_CAST_RANGE },

    getRange(): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: ROCK_SLIDE_CAST_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Rip up a rock within ${ROCK_SLIDE_ROCK_MAX_TILE_OFFSET} tiles, then punch it along a straight line`,
            `The rock flies up to ${ROCK_SLIDE_TRAVEL_TILES} tiles, dealing {${ROCK_SLIDE_DAMAGE}} damage to the first ${ROCK_SLIDE_MAX_DAMAGE_TARGETS} enemies`,
            'Every enemy it touches is knocked off to the side',
            'It lands as a new rock when it hits a wall or runs out of range',
        ];
    },

    onProjectileExpired(engine: unknown, _caster: Unit, projectile: Projectile): void {
        // Hit a wall or ran out of range: the rock comes to rest on the tile it stopped over.
        settleRockAt(engine as AbilityEngineContext, projectile.x, projectile.y);
    },

    /** Keeps the picks visible after they are made: the rock tile until it is destroyed, the arrow until launch. */
    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        active: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - active.startTime;
        if (elapsed < ROCK_SLIDE_AIM_START) {
            const rockPos = pickPosition(active, ROCK_LABEL, 0);
            const rockTile = rockPos ? resolveRockTile(caster, rockPos) : null;
            if (rockTile) {
                drawTileAreaTelegraph(gr, [rockTile], { ...TELEGRAPH_STYLES.danger, fillAlpha: 0.2 });
            }
        }
        if (elapsed >= ROCK_SLIDE_AIM_START && elapsed < ROCK_SLIDE_LAUNCH_TIME) {
            const aimPos = pickPosition(active, DIRECTION_LABEL, DIRECTION_TARGET_INDEX);
            const dir = aimPos ? resolveSlideDirection(caster, aimPos) : null;
            if (dir) {
                drawTileAreaTelegraph(gr, [dir.tile], TELEGRAPH_STYLES.danger);
                drawArrow(gr, tileCentre(dir.tile), dir.dirCol, dir.dirRow, TELEGRAPH_STYLES.danger.color);
            }
        }
    },
});

export const RockSlideCard: CardDef = {
    abilityId: ABILITY_ID,
};
