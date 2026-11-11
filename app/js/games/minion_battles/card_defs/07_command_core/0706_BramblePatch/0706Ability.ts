/**
 * Bramble Patch (pet strike) — commanded by the player's Bramble Patch card (0707).
 * Owns the slam windup (pet rooted) then Thorn Stomp–style payoff. Restored only by
 * commandCharge from the owner card.
 *
 * Tile-based: the slam snaps to the pet's tile and covers a square round it (3x3, 5x5 with Overgrowth's
 * `tileAreaRadiusFlat`). Each bramble survives `BRAMBLE_PATCH_THORN_USES` triggers. Damage, thorns and every preview (pet windup, owner telegraph, confirm step)
 * read `resolveBramblePatchCells`, so the telegraph shows exactly the tiles that get thorns.
 */

import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { Effect } from '../../../game/effects/Effect';
import { SPELL_CIRCLE_STYLE_COMMAND } from '../../../game/spellCircles/spellCircles';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { ActiveAbility } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import type { KnockbackSource } from '../../../game/units/unitTypes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { damageEnemiesInTiles, placeJitteredGroundThorns } from '../../../abilities/targetHelpers';
import { cellsAroundPoint, tileShapes, type TileOffset } from '../../../hitboxes/TileAreaHitboxSpec';
import { getCasterAbilityModifier, getTileAreaHalfWidth } from '../../../abilities/abilityModifierScales';
import { tileCentre, worldToTile, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { drawTileAreaTelegraph } from '../../../abilities/previewHelpers';
import { TELEGRAPH_STYLES, type TelegraphStyle } from '../../../abilities/telegraphStyles';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import type { EventBus } from '../../../game/EventBus';
import type { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { getCastElapsedAt } from '../../../game/time/actorClock';

export const BRAMBLE_PATCH_STRIKE_ID = `${formatGroupId(AbilityGroupId.Command)}06`;

/** Half-width of the slam's square, in tiles: 1 = 3x3 round the spirit's tile. */
export const BRAMBLE_PATCH_HALF_WIDTH = 1;

/** Half-width for `unit`'s slam: the base plus research `tileAreaRadiusFlat` (Overgrowth makes it 5x5). */
export function bramblePatchHalfWidth(unit: Pick<Unit, 'abilityModifiers'> | undefined): number {
    return getTileAreaHalfWidth(BRAMBLE_PATCH_HALF_WIDTH, getCasterAbilityModifier(unit, BRAMBLE_PATCH_STRIKE_ID));
}

const shapeByHalfWidth = new Map<number, TileOffset[]>();
/** Tile footprint of a slam of this half-width: a (2h+1) x (2h+1) square. Shared per size. */
export function bramblePatchShape(halfWidth: number): TileOffset[] {
    let shape = shapeByHalfWidth.get(halfWidth);
    if (!shape) {
        shape = tileShapes.square(halfWidth);
        shapeByHalfWidth.set(halfWidth, shape);
    }
    return shape;
}

/** Radius (px) reaching the edge of the square: the VFX size and the thorns' edge-first expiry. */
export function bramblePatchRadius(halfWidth: number): number {
    return (halfWidth + 0.5) * CELL_SIZE;
}

/** The base (3x3) footprint and radius. */
export const BRAMBLE_PATCH_SHAPE = bramblePatchShape(BRAMBLE_PATCH_HALF_WIDTH);
export const BRAMBLE_PATCH_RADIUS = bramblePatchRadius(BRAMBLE_PATCH_HALF_WIDTH);

/** Centre of the tile a slam from `at` lands on. */
export function bramblePatchCentre(at: { x: number; y: number }): { x: number; y: number } {
    return tileCentre(worldToTile(at.x, at.y));
}

/** The tiles a slam from `at` covers (damage, thorns and previews share this). */
export function resolveBramblePatchCells(at: { x: number; y: number }, halfWidth = BRAMBLE_PATCH_HALF_WIDTH): TileCoord[] {
    return cellsAroundPoint(at, bramblePatchShape(halfWidth));
}

/** Windup telegraph (red, fading in) and the green "about to land" look. */
export const BRAMBLE_PATCH_WINDUP_STYLE: TelegraphStyle = TELEGRAPH_STYLES.danger;
export const BRAMBLE_PATCH_LANDING_STYLE: TelegraphStyle = { color: 0x86efac, lineWidth: 2, fillAlpha: 0.14, strokeAlpha: 0.8 };

/** Draw the slam's tiles from `at`, fading the windup style in over `windupT` (0→1). */
export function drawBramblePatchTelegraph(
    gr: IAbilityPreviewGraphics,
    at: { x: number; y: number },
    windupT: number | null,
    halfWidth = BRAMBLE_PATCH_HALF_WIDTH,
): void {
    const cells = resolveBramblePatchCells(at, halfWidth);
    if (windupT === null) {
        drawTileAreaTelegraph(gr, cells, BRAMBLE_PATCH_LANDING_STYLE);
        return;
    }
    const t = Math.max(0, Math.min(1, windupT));
    drawTileAreaTelegraph(gr, cells, {
        ...BRAMBLE_PATCH_WINDUP_STYLE,
        strokeAlpha: 0.25 + 0.6 * t,
        fillAlpha: BRAMBLE_PATCH_WINDUP_STYLE.fillAlpha * t,
    });
}
export const BRAMBLE_PATCH_DAMAGE = 7;
export const BRAMBLE_PATCH_KNOCKBACK_TIER = 2;
/** Pet windup length — command card telegraph is timed to match. */
export const BRAMBLE_PATCH_WINDUP = 1.0;
/**
 * Same ground thorns as lanternite nest aura (`0014`): DoT hits `dark_creature` only, so
 * players and lanternites are treated as allied (immune). Distinct from Thornbinder's
 * `dark_thorn`, which damages everything except dark creatures.
 */
export const BRAMBLE_PATCH_THORN_EFFECT_TYPE = 'bramble_slow';
const SLOW_MULT = 0.52;
/** Shadow creatures a bramble can prick before it is torn away (`thornUses`; 1 for other thorns). */
export const BRAMBLE_PATCH_THORN_USES = 5;
const THORN_CLEAR_BEFORE_NEXT_SEC = 0.15;
const DURATION_JITTER_IN_SECONDS = 1;

const WINDUP = BRAMBLE_PATCH_WINDUP;
const STRIKE_END = WINDUP + 1 / 60;
const COOLDOWN_END = STRIKE_END + 0.1;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

interface EngineLike {
    units: Unit[];
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    terrainLayers: TerrainLayerManager;
    lightLevelEnabled: boolean;
    globalLightLevel: number;
    terrainManager: { grid: import('../../../terrain/TerrainGrid').TerrainGrid } | null;
    addEffect(effect: Effect): void;
    getAllLightSources(): import('../../../game/LightGrid').LightSource[];
    generateRandomInteger(min: number, max: number): number;
}

export function applyBramblePatchStrike(engine: EngineLike, caster: Unit): void {
    // Snap the slam to the pet's tile: everything below is tile-based.
    const center = bramblePatchCentre(caster);
    const halfWidth = bramblePatchHalfWidth(caster);
    const radius = bramblePatchRadius(halfWidth);
    const cells = resolveBramblePatchCells(center, halfWidth);
    const knockbackCtx = knockbackCtxFromEngine(engine);
    const knockbackSource: KnockbackSource = { unitId: caster.id, abilityId: BRAMBLE_PATCH_STRIKE_ID };

    damageEnemiesInTiles({
        engine,
        caster,
        tiles: cells,
        origin: center,
        damage: BRAMBLE_PATCH_DAMAGE,
        abilityId: BRAMBLE_PATCH_STRIKE_ID,
        attackType: 'melee',
        onHit: (unit) => {
            tryDamageOrBlock(unit, {
                engine,
                gameTime: engine.gameTime,
                eventBus: engine.eventBus,
                attackerX: center.x,
                attackerY: center.y,
                attackerId: caster.id,
                abilityId: BRAMBLE_PATCH_STRIKE_ID,
                damage: BRAMBLE_PATCH_DAMAGE,
                attackType: 'melee',
            });
            tryApplyKnockbackByTier(unit, BRAMBLE_PATCH_KNOCKBACK_TIER, knockbackSource, center.x, center.y, knockbackCtx);
        },
    });

    const baseExpiresAt = engine.gameTime + ROUND_DURATION - THORN_CLEAR_BEFORE_NEXT_SEC;
    placeJitteredGroundThorns({
        engine,
        caster,
        center,
        radius,
        effectType: BRAMBLE_PATCH_THORN_EFFECT_TYPE,
        placedAtGameTime: engine.gameTime,
        baseExpiresAtGameTime: baseExpiresAt,
        durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
        ownerAbilityId: BRAMBLE_PATCH_STRIKE_ID,
        params: { slowMult: SLOW_MULT, thornUses: BRAMBLE_PATCH_THORN_USES },
        idPrefix: `bramblepatch-${caster.id}-${engine.gameTime}`,
        cells,
    });

    engine.addEffect(new Effect({
        x: center.x,
        y: center.y,
        duration: 0.6,
        effectType: 'BrambleExplosion',
        effectRadius: radius,
    }));
}

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: WINDUP,
        abilityPhase: AbilityPhase.Windup,
        // The spirit gathers itself: the Command spell circle (motes rising off a pine ring) until the slam.
        castBehaviours: [
            { timingStart: 'start', timingEnd: 'end', behaviour: CastBehaviours.SpellCircle({ style: SPELL_CIRCLE_STYLE_COMMAND }) },
        ],
    },
    {
        id: 'strike',
        start: WINDUP,
        end: STRIKE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    applyBramblePatchStrike(ctx.engine as unknown as EngineLike, ctx.caster);
                }),
            },
        ],
    },
    { id: 'cooldown', start: STRIKE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
];

export const BramblePatchStrikeAbility_0706: AbilityStatic = defineAbility({
    id: BRAMBLE_PATCH_STRIKE_ID,
    name: 'Bramble Patch',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: RECOVERIES,
    durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
    prefireTime: WINDUP,
    // Full root for the windup so the pet cannot walk out of the slam telegraph.
    movementLock: { until: WINDUP },
    // No aiSettings — only commanded via 0707.
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    getRange: (caster: Unit) => ({ minRange: 0, maxRange: bramblePatchRadius(bramblePatchHalfWidth(caster)) }),

    getTooltipText(): string[] {
        return [
            `Slam the ground, dealing damage and leaving lanternite-style bramble that slows movement and pricks shadow creatures. Each bramble lasts {${BRAMBLE_PATCH_THORN_USES}} pricks.`,
            `{Knockback ${BRAMBLE_PATCH_KNOCKBACK_TIER}}`,
        ];
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = getCastElapsedAt(activeAbility, gameTime);
        drawBramblePatchTelegraph(gr, caster, elapsed >= WINDUP ? null : elapsed / WINDUP, bramblePatchHalfWidth(caster));
    },
});
