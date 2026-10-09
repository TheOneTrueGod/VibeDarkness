/**
 * Rock Slide — Earth Core ground ability. The caster rips a rock tile out of the ground within two
 * tiles, picks one of the four tiles next to them, and punches the rock down that line as a fast
 * projectile that damages the first five enemies, knocks every enemy it touches off to the side,
 * and comes to rest as a new rock tile.
 *
 * Timeline (seconds):
 *   0.00        pick the rock (interactive select; caster shakes, chips fly rock -> caster)
 *   0.37        the rock is destroyed (becomes rubble)
 *   0.40        pick the direction (interactive select; chips fly out of the caster)
 *   0.70        the rock projectile appears, dormant, on the picked tile
 *   0.70-0.85  punch slide-in
 *   0.85        projectile launches
 *   0.85-1.00  punch slide-out
 *   1.00-1.40  cooldown
 *
 * Interrupts: the destroyed rock stays destroyed; a projectile that has not launched yet is
 * removed and its tile becomes rock; once launched the projectile flies on regardless, and an
 * interrupt during cooldown ends the cast.
 */

import {
    AbilityState,
    type AbilityStatic,
    type AbilityStateEntry,
    type AbilityRenderOffset,
    type IAbilityPreviewGraphics,
} from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import type { EventBus } from '../../../game/EventBus';
import { Projectile } from '../../../game/projectiles/Projectile';
import { type CardDef } from '../../types';
import { tileSelectHitbox } from '../../../hitboxes/TileSelectHitboxSpec';
import { drawTileHighlight, worldToTile, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    ROCK_SLIDE_ROCK_MAX_TILE_OFFSET,
    ROCK_SLIDE_CAST_RANGE,
    ROCK_SLIDE_PICK_END,
    ROCK_SLIDE_DESTROY_TIME,
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
    resolveRockTile,
    isRockTile,
    resolveSlideDirection,
    isSlideSpawnTile,
    tileCenter,
    type RockSlideTerrain,
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

/** Damage large enough to take any rock tile straight to rubble. */
const DESTROY_ROCK_DAMAGE = 1_000_000;

const PREVIEW_STYLE = { color: 0xff2a2a, lineWidth: 2, fillAlpha: 0.12, strokeAlpha: 0.9 } as const;
const INVALID_COLOR = 0x9ca3af;

const ROCK_SLIDE_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="9" width="22" height="22" rx="3" fill="#757575" stroke="#4a4a4a" stroke-width="2"/>
  <path d="M10 16 L16 22 L13 28" fill="none" stroke="#3c3c3c" stroke-width="2"/>
  <path d="M29 14 L36 20 L29 26" fill="none" stroke="#e5e7eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ---- Engine / payload shapes ----

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    projectiles: Projectile[];
    addEffect(effect: unknown): void;
    addEffectEmitter(emitter: unknown): void;
    addProjectile(projectile: Projectile): void;
    terrainManager?: (RockSlideTerrain & {
        damageRock(col: number, row: number, damage?: number, sourceUnitId?: string | null): unknown;
        createOrMarkRock(col: number, row: number): unknown;
    }) | null;
}

/** Per-cast scratch state, stored on `active.castPayload` (plain JSON so it survives snapshots). */
interface RockSlidePayload {
    chipsSpawned?: boolean;
    rockCol?: number;
    rockRow?: number;
    /** False if the rock pick turned out to be illegal when it was time to destroy it. */
    destroyed?: boolean;
    dirCol?: number;
    dirRow?: number;
    spawnCol?: number;
    spawnRow?: number;
    projectileId?: string;
    launched?: boolean;
}

function payloadOf(active: ActiveAbility | undefined): RockSlidePayload | null {
    if (!active) return null;
    if (active.castPayload == null) active.castPayload = {};
    return active.castPayload as RockSlidePayload;
}

/** Reads a pick by label (interactive runs), falling back to its positional slot (committed runs). */
function getPick(
    active: ActiveAbility | undefined,
    targets: ResolvedTarget[],
    label: string,
    index: number,
): { x: number; y: number } | null {
    const t = active?.targetsByLabel?.[label] ?? targets[index];
    if (!t || t.type !== 'pixel' || !t.position) return null;
    return t.position;
}

// ---- Select defs ----

const ROCK_HITBOX = tileSelectHitbox({
    mode: 'within',
    maxTileOffset: ROCK_SLIDE_ROCK_MAX_TILE_OFFSET,
    castRange: ROCK_SLIDE_CAST_RANGE,
    previewStyle: PREVIEW_STYLE,
});

const DIRECTION_HITBOX = tileSelectHitbox({
    mode: 'adjacentCardinal',
    castRange: ROCK_SLIDE_CAST_RANGE,
    previewStyle: PREVIEW_STYLE,
});

function terrainOf(engine: unknown): EngineLike['terrainManager'] {
    return (engine as EngineLike).terrainManager ?? null;
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
            hitbox: ROCK_HITBOX,
            filter: 'any',
            allowMiss: true,
            validatePick({ caster, engine, pick }) {
                const tm = terrainOf(engine);
                if (!tm || pick.type !== 'pixel' || !pick.position) return false;
                return isRockTile(tm, resolveRockTile(caster, pick.position));
            },
        },
    },
    { id: 'windup', start: ROCK_SLIDE_PICK_END, end: ROCK_SLIDE_AIM_START, abilityPhase: AbilityPhase.Windup },
    {
        id: 'pickDirection',
        start: ROCK_SLIDE_AIM_START,
        end: ROCK_SLIDE_AIM_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: DIRECTION_LABEL,
            hitbox: DIRECTION_HITBOX,
            filter: 'any',
            allowMiss: true,
            validatePick({ caster, engine, pick }) {
                const tm = terrainOf(engine);
                if (!tm || pick.type !== 'pixel' || !pick.position) return false;
                const dir = resolveSlideDirection(caster, pick.position);
                return dir != null && isSlideSpawnTile(tm, dir.tile);
            },
        },
    },
    { id: 'charge', start: ROCK_SLIDE_AIM_END, end: ROCK_SLIDE_SPAWN_TIME, abilityPhase: AbilityPhase.Active, doNotRefund: true },
    { id: 'punchIn', start: ROCK_SLIDE_SPAWN_TIME, end: ROCK_SLIDE_LAUNCH_TIME, abilityPhase: AbilityPhase.Active, doNotRefund: true },
    { id: 'punchOut', start: ROCK_SLIDE_LAUNCH_TIME, end: ROCK_SLIDE_SLIDE_END_TIME, abilityPhase: AbilityPhase.Active, doNotRefund: true },
    { id: 'cooldown', start: ROCK_SLIDE_SLIDE_END_TIME, end: ROCK_SLIDE_CAST_TIME, abilityPhase: AbilityPhase.Cooldown },
];

// ---- Steps ----

function crossed(prev: number, current: number, at: number): boolean {
    return prev < at && current >= at;
}

/** Step 2: destroy the picked rock (it becomes rubble). */
function destroyRock(eng: EngineLike, caster: Unit, payload: RockSlidePayload, rockTile: TileCoord): void {
    const tm = eng.terrainManager;
    if (!tm || !isRockTile(tm, rockTile)) {
        payload.destroyed = false;
        return;
    }
    tm.damageRock(rockTile.col, rockTile.row, DESTROY_ROCK_DAMAGE, caster.id);
    payload.destroyed = tm.getEffectiveTerrainType(rockTile.col, rockTile.row) !== TerrainType.Rock;
    if (payload.destroyed) {
        const c = tileCenter(rockTile);
        spawnRockSlideBreak(eng, c.x, c.y);
    }
}

/** Step 5: create the dormant projectile on the picked tile. */
function spawnProjectile(eng: EngineLike, caster: Unit, payload: RockSlidePayload, spawn: TileCoord): void {
    const c = tileCenter(spawn);
    const projectile = new Projectile({
        x: c.x,
        y: c.y,
        // Dormant until the slide-in finishes: no velocity, and it does not hit anyone yet.
        velocityX: 0,
        velocityY: 0,
        damage: ROCK_SLIDE_DAMAGE,
        sourceTeamId: caster.teamId,
        sourceUnitId: caster.id,
        sourceAbilityId: ABILITY_ID,
        maxDistance: ROCK_SLIDE_TRAVEL_TILES * CELL_SIZE,
        projectileType: 'rock_slide',
        passThroughEnemies: true,
        pierce: ROCK_SLIDE_MAX_DAMAGE_TARGETS - 1,
        continueAfterMaxHits: true,
        knockbackBeyondMaxHits: true,
        knockbackTier: ROCK_SLIDE_KNOCKBACK_TIER,
        knockbackMode: 'side45',
        stopAtImpassable: true,
    });
    projectile.radius = ROCK_SLIDE_PROJECTILE_RADIUS;
    eng.addProjectile(projectile);
    payload.projectileId = projectile.id;
}

/** Step 7: the projectile starts flying and becomes live. */
function launchProjectile(eng: EngineLike, payload: RockSlidePayload): void {
    const projectile = eng.projectiles.find((p) => p.id === payload.projectileId);
    if (!projectile || !projectile.active) return;
    projectile.velocityX = (payload.dirCol ?? 0) * ROCK_SLIDE_PROJECTILE_SPEED;
    projectile.velocityY = (payload.dirRow ?? 0) * ROCK_SLIDE_PROJECTILE_SPEED;
    projectile.passThroughEnemies = false;
    payload.launched = true;
}

// ---- Preview helpers ----

function drawArrow(gr: IAbilityPreviewGraphics, tile: TileCoord, dirCol: number, dirRow: number, color: number): void {
    const c = tileCenter(tile);
    const length = 24;
    const headLen = 11;
    const headHalf = 10;
    const shaftHalf = 3.5;
    const px = -dirRow;
    const py = dirCol;
    const tail = { x: c.x - dirCol * length / 2, y: c.y - dirRow * length / 2 };
    const tip = { x: c.x + dirCol * length / 2, y: c.y + dirRow * length / 2 };
    const base = { x: tip.x - dirCol * headLen, y: tip.y - dirRow * headLen };
    const pts = [
        { x: tail.x + px * shaftHalf, y: tail.y + py * shaftHalf },
        { x: base.x + px * shaftHalf, y: base.y + py * shaftHalf },
        { x: base.x + px * headHalf, y: base.y + py * headHalf },
        tip,
        { x: base.x - px * headHalf, y: base.y - py * headHalf },
        { x: base.x - px * shaftHalf, y: base.y - py * shaftHalf },
        { x: tail.x - px * shaftHalf, y: tail.y - py * shaftHalf },
    ];
    const path = (): void => {
        gr.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) gr.lineTo(pts[i]!.x, pts[i]!.y);
        gr.lineTo(pts[0]!.x, pts[0]!.y);
    };
    path();
    gr.fill({ color, alpha: 0.85 });
    path();
    gr.stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
}

function drawInvalidMark(gr: IAbilityPreviewGraphics, tile: TileCoord): void {
    const x0 = tile.col * CELL_SIZE + 6;
    const y0 = tile.row * CELL_SIZE + 6;
    const x1 = (tile.col + 1) * CELL_SIZE - 6;
    const y1 = (tile.row + 1) * CELL_SIZE - 6;
    gr.moveTo(x0, y0);
    gr.lineTo(x1, y1);
    gr.moveTo(x1, y0);
    gr.lineTo(x0, y1);
    gr.stroke({ color: INVALID_COLOR, width: 3, alpha: 0.95 });
}

function easeOutCubic(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return 1 - (1 - c) ** 3;
}

function easeInOutQuad(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return c < 0.5 ? 2 * c * c : 1 - ((-2 * c + 2) ** 2) / 2;
}

// ---- Ability ----

export const RockSlideAbility_0537: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Rock Slide',
    image: ROCK_SLIDE_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: ROCK_SLIDE_RECHARGE_TURNS,
    prefireTime: ROCK_SLIDE_DESTROY_TIME,
    abilityTimings: TIMINGS,
    targets: [],
    interruptEndsCooldown: true,
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

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < ROCK_SLIDE_LAUNCH_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void {
        const payload = payloadOf(active);
        if (!payload) return;
        const eng = engine as EngineLike;

        // Step 1 (first tick after the rock pick): chips fly from the rock into the caster.
        const rockPick = getPick(active, targets, ROCK_LABEL, 0);
        if (rockPick && !payload.chipsSpawned && currentTime > 0) {
            const rockTile = resolveRockTile(caster, rockPick);
            payload.rockCol = rockTile.col;
            payload.rockRow = rockTile.row;
            payload.chipsSpawned = true;
            spawnRockSlideInwardChips(eng, caster, tileCenter(rockTile));
        }

        // Step 2: destroy the rock.
        if (crossed(prevTime, currentTime, ROCK_SLIDE_DESTROY_TIME) && payload.rockCol != null && payload.rockRow != null) {
            destroyRock(eng, caster, payload, { col: payload.rockCol, row: payload.rockRow });
        }

        // Steps 3-4: direction is known as the aim select resolves; chips fly out of the caster.
        if (crossed(prevTime, currentTime, ROCK_SLIDE_AIM_START)) {
            const aim = getPick(active, targets, DIRECTION_LABEL, 1);
            const dir = aim ? resolveSlideDirection(caster, aim) : null;
            if (dir && payload.destroyed) {
                payload.dirCol = dir.dirCol;
                payload.dirRow = dir.dirRow;
                payload.spawnCol = dir.tile.col;
                payload.spawnRow = dir.tile.row;
                spawnRockSlideOutwardChips(eng, caster, dir.dirCol, dir.dirRow);
            }
        }

        // Step 5: spawn the (dormant) rock projectile, if both picks were legal.
        if (crossed(prevTime, currentTime, ROCK_SLIDE_SPAWN_TIME) && payload.spawnCol != null && payload.spawnRow != null) {
            const spawn = { col: payload.spawnCol, row: payload.spawnRow };
            const tm = eng.terrainManager;
            if (tm && isSlideSpawnTile(tm, spawn)) spawnProjectile(eng, caster, payload, spawn);
        }

        // Step 7: after the slide-in, the projectile flies.
        if (crossed(prevTime, currentTime, ROCK_SLIDE_LAUNCH_TIME) && payload.projectileId) {
            launchProjectile(eng, payload);
        }
    },

    onCastInterrupted(engine: unknown, _caster: Unit, active: ActiveAbility): void {
        const payload = active.castPayload as RockSlidePayload | undefined;
        if (!payload?.projectileId || payload.launched) return;
        const eng = engine as EngineLike;
        const projectile = eng.projectiles.find((p) => p.id === payload.projectileId);
        payload.projectileId = undefined;
        if (!projectile || !projectile.active) return;
        // Cancelled before launch: the rock settles into the ground where it stood.
        projectile.active = false;
        const tile = worldToTile(projectile.x, projectile.y);
        eng.terrainManager?.createOrMarkRock(tile.col, tile.row);
        spawnRockSlideSettle(eng, projectile.x, projectile.y);
    },

    onProjectileExpired(engine: unknown, _caster: Unit, projectile: Projectile): void {
        // Hit a wall or ran out of range: the rock comes to rest as a rock tile.
        const eng = engine as EngineLike;
        const tile = worldToTile(projectile.x, projectile.y);
        eng.terrainManager?.createOrMarkRock(tile.col, tile.row);
        spawnRockSlideSettle(eng, projectile.x, projectile.y);
    },

    getCasterRenderOffset(
        _caster: Unit,
        active: ActiveAbility,
        gameTime: number,
    ): AbilityRenderOffset | null {
        const elapsed = gameTime - active.startTime;
        if (elapsed < 0) return null;

        // Steps 1-3: a growing shake while the rock is torn loose.
        if (elapsed < ROCK_SLIDE_AIM_START) {
            const intensity = 1 + 2 * (elapsed / ROCK_SLIDE_AIM_START);
            return { x: Math.sin(elapsed * 90) * intensity, y: Math.cos(elapsed * 110) * intensity * 0.6 };
        }

        // Steps 6-7: punch toward the rock and back.
        const payload = active.castPayload as RockSlidePayload | undefined;
        const dirCol = payload?.dirCol;
        const dirRow = payload?.dirRow;
        if (dirCol == null || dirRow == null) return { x: 0, y: 0 };
        if (elapsed < ROCK_SLIDE_SPAWN_TIME) return { x: 0, y: 0 };
        let magnitude = 0;
        if (elapsed < ROCK_SLIDE_LAUNCH_TIME) {
            magnitude = easeOutCubic((elapsed - ROCK_SLIDE_SPAWN_TIME) / (ROCK_SLIDE_LAUNCH_TIME - ROCK_SLIDE_SPAWN_TIME))
                * ROCK_SLIDE_PUNCH_DISTANCE;
        } else if (elapsed < ROCK_SLIDE_SLIDE_END_TIME) {
            magnitude = (1 - easeInOutQuad((elapsed - ROCK_SLIDE_LAUNCH_TIME) / (ROCK_SLIDE_SLIDE_END_TIME - ROCK_SLIDE_LAUNCH_TIME)))
                * ROCK_SLIDE_PUNCH_DISTANCE;
        }
        return { x: dirCol * magnitude, y: dirRow * magnitude };
    },

    /**
     * Engine-aware overlay on top of the hitbox tile highlight while a pick is pending: a grey X on
     * an illegal tile, and the direction arrow on the second pick.
     */
    renderTargetingPreviewSelectedTargets(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        _units: Unit[],
        gameState?: unknown,
    ): void {
        const tm = terrainOf(gameState);
        if (!tm) return;
        if (currentTargets.length === 0) {
            const tile = resolveRockTile(caster, mouseWorld);
            if (!isRockTile(tm, tile)) drawInvalidMark(gr, tile);
            return;
        }
        const dir = resolveSlideDirection(caster, mouseWorld);
        if (!dir) return;
        if (!isSlideSpawnTile(tm, dir.tile)) {
            drawInvalidMark(gr, dir.tile);
            return;
        }
        drawArrow(gr, dir.tile, dir.dirCol, dir.dirRow, 0xff2a2a);
    },

    /** Keeps the picks visible after they are made: rock tile until destroyed, arrow until launch. */
    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        active: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - active.startTime;
        const payload = active.castPayload as RockSlidePayload | undefined;
        if (elapsed < ROCK_SLIDE_DESTROY_TIME && payload?.rockCol != null && payload.rockRow != null) {
            drawTileHighlight(gr, { col: payload.rockCol, row: payload.rockRow }, { ...PREVIEW_STYLE, fillAlpha: 0.2 });
        }
        if (elapsed >= ROCK_SLIDE_AIM_START && elapsed < ROCK_SLIDE_LAUNCH_TIME
            && payload?.spawnCol != null && payload.spawnRow != null
            && payload.dirCol != null && payload.dirRow != null) {
            const tile = { col: payload.spawnCol, row: payload.spawnRow };
            drawTileHighlight(gr, tile, PREVIEW_STYLE);
            drawArrow(gr, tile, payload.dirCol, payload.dirRow, 0xff2a2a);
        }
    },
};

export const RockSlideCard: CardDef = {
    abilityId: ABILITY_ID,
};
