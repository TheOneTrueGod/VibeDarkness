/**
 * LightEater - Displacer Spirit boss ability. The spirit crouches, then flies fast and straight
 * (over rocks and walls, using the knockback airborne mechanism) to the nearest light source, lands
 * exactly on it and devours part of it (extinguishing it if it is already dim), healing and gaining
 * a super bar. The dark explosion is forecast with a circle at the light from the moment the cast
 * starts; it detonates a moment after landing. The AI casts it every other round (rounds 0, 2, 4, ...), second or third quarter of the round only.
 */

import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import type { TargetDef } from '../../../abilities/targeting';
import { damageEnemiesInCircle } from '../../../abilities/targetHelpers';
import { Effect } from '../../../game/effects/Effect';
import type { EventBus } from '../../../game/EventBus';
import type { SpecialTile } from '../../../game/specialTiles/SpecialTile';
import type { LightSource } from '../../../game/lightSources/LightSource';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { applyHeal } from '../../../game/units/unitHeal';
import type { Unit } from '../../../game/units/Unit';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { spawnDisplacerBoltProjectile } from '../0017_DisplacerBolt/0017Ability';
import {
    LIGHT_EATER_ENRAGED_RING_MULTIPLIER,
    LIGHT_EATER_ROUND_INTERVAL,
    LIGHT_EATER_ROUND_WINDOW,
} from '../../../game/displacer/displacerConstants';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { getCastElapsedAt } from '../../../game/time/actorClock';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}18`;
export const LIGHT_EATER_ID = CARD_ID;

/** Light strength removed from the devoured source; a source at or below this is extinguished. */
export const LIGHT_EATER_LIGHT_REDUCTION = 4;
/** Super bars granted on landing. */
export const LIGHT_EATER_SUPER_GAIN = 1;
/** HP restored on landing (whether the light is reduced or extinguished). */
export const LIGHT_EATER_HEAL = 10;
/** Displacer Bolt projectiles fired in an evenly spaced ring at the explosion (only if a light was devoured). */
export const LIGHT_EATER_RING_PROJECTILES = 12;
/** Fixed (deterministic) rotation of the ring, radians. */
export const LIGHT_EATER_RING_ROTATION = 0;
/** Dark explosion damage (design range 5-10). */
export const LIGHT_EATER_EXPLOSION_DAMAGE = 8;
export const LIGHT_EATER_EXPLOSION_RADIUS = 100;

/** Seconds of crouch before takeoff. */
export const LIGHT_EATER_WINDUP_TIME = 0.3;
/** Seconds of constant-speed straight-line flight to the light (airborne, ignores terrain). */
export const LIGHT_EATER_FLIGHT_TIME = 0.5;
/** Cast-relative time of landing (devour, heal and +super happen here). */
export const LIGHT_EATER_LANDING_TIME = LIGHT_EATER_WINDUP_TIME + LIGHT_EATER_FLIGHT_TIME;
/** Seconds between landing and the explosion. */
export const LIGHT_EATER_TELEGRAPH_SEC = 1.2;
export const LIGHT_EATER_EXPLODE_TIME = LIGHT_EATER_LANDING_TIME + LIGHT_EATER_TELEGRAPH_SEC;
const STRIKE_END = LIGHT_EATER_EXPLODE_TIME + 1 / 60;
const COOLDOWN_END = STRIKE_END + 0.6;

const DARK_PURPLE = 0x9933cc;
const TELEGRAPH_RED = 0xef4444;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const LIGHT_EATER_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="24" fill="#1b1030" stroke="#9933cc" stroke-width="3"/>
  <circle cx="32" cy="32" r="9" fill="#ffd966"/>
  <path d="M32 6 L32 16 M32 48 L32 58 M6 32 L16 32 M48 32 L58 32" stroke="#9933cc" stroke-width="3"/>
</svg>`;

/** Destination resolved at cast start and stored in the active ability castPayload (serialized). */
export interface LightEaterPayload {
    /** Light tile to devour; null when no light existed at cast start (explodes in place). */
    tileId: string | null;
    x: number;
    y: number;
}

export function readLightEaterPayload(active: { castPayload?: unknown } | undefined): LightEaterPayload | null {
    const p = active?.castPayload as Partial<LightEaterPayload> | undefined;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return { tileId: p.tileId ?? null, x: p.x, y: p.y };
}

interface LightEaterEngine {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    specialTiles: SpecialTile[];
    lightSources: LightSource[];
    damageSpecialTile(tileId: string, amount: number): boolean;
    addEffect(effect: Effect): void;
    addProjectile(projectile: import('../../../game/projectiles/Projectile').Projectile): void;
}

/** True for tiles the spirit can devour: still burning, emitting visible (non-dark) light. */
function isDevourableLight(tile: SpecialTile): boolean {
    return (
        tile.hp > 0 &&
        tile.emitsLight != null &&
        tile.emitsLight.lightAmount > 0 &&
        tile.emitsLight.lightType !== 'DarkLight'
    );
}

export function lightTileCenter(tile: Pick<SpecialTile, 'col' | 'row'>): { x: number; y: number } {
    return { x: tile.col * CELL_SIZE + CELL_SIZE / 2, y: tile.row * CELL_SIZE + CELL_SIZE / 2 };
}

/** Nearest devourable light-emitting special tile to a point, or null when none remain. */
export function findNearestLightTile(
    tiles: readonly SpecialTile[],
    from: { x: number; y: number },
): SpecialTile | null {
    let best: SpecialTile | null = null;
    let bestDistSq = Infinity;
    for (const tile of tiles) {
        if (!isDevourableLight(tile)) continue;
        const c = lightTileCenter(tile);
        const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
        if (d < bestDistSq) {
            best = tile;
            bestDistSq = d;
        }
    }
    return best;
}

/** AI gate: the ability is pointless with no light left to eat. */
export function anyDevourableLight(tiles: readonly SpecialTile[]): boolean {
    return tiles.some(isDevourableLight);
}

/**
 * Eat `LIGHT_EATER_LIGHT_REDUCTION` strength from a light tile. A source whose strength is already
 * at or below the reduction is eliminated outright. Returns what happened.
 */
export function devourLight(
    engine: Pick<LightEaterEngine, 'damageSpecialTile'>,
    tile: SpecialTile,
): 'reduced' | 'eliminated' {
    const light = tile.emitsLight;
    if (!light || light.lightAmount <= LIGHT_EATER_LIGHT_REDUCTION) {
        engine.damageSpecialTile(tile.id, tile.hp);
        return 'eliminated';
    }
    light.lightAmount -= LIGHT_EATER_LIGHT_REDUCTION;
    return 'reduced';
}

/** True for free-standing light sources (torches, deployables, ...) that still emit visible light. */
function isDevourableLightSource(ls: LightSource): boolean {
    return ls.active && ls.lightAmount > 0 && ls.lightType !== 'DarkLight';
}

/**
 * Damage a free-standing LightSource by `LIGHT_EATER_LIGHT_REDUCTION`; one already at or below that is
 * put out. The source's decay baseline is lowered too, otherwise round-end decay would recompute its
 * strength from the original value and quietly undo the damage.
 */
export function devourLightSource(ls: LightSource): 'reduced' | 'eliminated' {
    if (ls.lightAmount <= LIGHT_EATER_LIGHT_REDUCTION) {
        ls.lightAmount = 0;
        ls.active = false;
        return 'eliminated';
    }
    ls.lightAmount -= LIGHT_EATER_LIGHT_REDUCTION;
    ls.decay.initialLightAmount = Math.max(0, ls.decay.initialLightAmount - LIGHT_EATER_LIGHT_REDUCTION);
    return 'reduced';
}

/**
 * The explosion damages every light in its radius: map light tiles (campfires, crystals, ...) and
 * free-standing light sources alike, including ones the players placed (torches, deployables).
 * `excludeTileId` skips the tile the spirit already devoured on landing so it is not bitten twice.
 */
export function devourLightsInRadius(
    engine: Pick<LightEaterEngine, 'specialTiles' | 'lightSources' | 'damageSpecialTile'>,
    center: { x: number; y: number },
    radius: number,
    excludeTileId: string | null = null,
): { reduced: number; eliminated: number } {
    const result = { reduced: 0, eliminated: 0 };
    const rSq = radius * radius;
    // Snapshot: eliminating a tile can mutate the engine's list.
    for (const tile of [...engine.specialTiles]) {
        if (tile.id === excludeTileId || !isDevourableLight(tile)) continue;
        const c = lightTileCenter(tile);
        if ((c.x - center.x) ** 2 + (c.y - center.y) ** 2 > rSq) continue;
        result[devourLight(engine, tile)]++;
    }
    for (const ls of engine.lightSources) {
        if (!isDevourableLightSource(ls)) continue;
        if ((ls.x - center.x) ** 2 + (ls.y - center.y) ** 2 > rSq) continue;
        result[devourLightSource(ls)]++;
    }
    return result;
}

const _base: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Light Eater',
    image: LIGHT_EATER_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: LIGHT_EATER_EXPLODE_TIME,
    abilityTimings: [
        { id: 'crouch', start: 0, end: LIGHT_EATER_WINDUP_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'flight', start: LIGHT_EATER_WINDUP_TIME, end: LIGHT_EATER_LANDING_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'telegraph', start: LIGHT_EATER_LANDING_TIME, end: LIGHT_EATER_EXPLODE_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'explode', start: LIGHT_EATER_EXPLODE_TIME, end: STRIKE_END, abilityPhase: AbilityPhase.Active, doNotRefund: true },
        { id: 'cooldown', start: STRIKE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: 0,
        maxUsesPerRound: 1,
        priority: 30, // below Phantom Decoy (40) when both are eligible
        ninjutsu: { ignore: true },
        roundWindow: LIGHT_EATER_ROUND_WINDOW,
        canUse: (_caster, ctx) =>
            Math.floor(ctx.gameTime / ROUND_DURATION) % LIGHT_EATER_ROUND_INTERVAL === 0 &&
            anyDevourableLight(ctx.getSpecialTiles()),
    },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: 0 }),

    getTooltipText(): string[] {
        return [
            `Fly over the terrain to the nearest light and devour ${LIGHT_EATER_LIGHT_REDUCTION} of its strength (extinguishing weak lights)`,
            `Heal ${LIGHT_EATER_HEAL} and gain ${LIGHT_EATER_SUPER_GAIN} super bar on landing, then detonate for ${LIGHT_EATER_EXPLOSION_DAMAGE} damage and heal ${LIGHT_EATER_HEAL} again`,
            `The blast also looses a ring of ${LIGHT_EATER_RING_PROJECTILES} Displacer Bolts (${LIGHT_EATER_RING_PROJECTILES * LIGHT_EATER_ENRAGED_RING_MULTIPLIER} when enraged)`,
            'The blast area is shown at the light as soon as the cast begins',
            `The blast also damages every other light in its radius by ${LIGHT_EATER_LIGHT_REDUCTION}, including ones the players placed`,
            'Used every other round, in the middle of the round',
        ];
    },
});

export const LightEaterAbility: AbilityStatic = {
    ..._base,

    /** Resolve the destination once, at cast start, so the forecast and flight agree on every client. */
    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as LightEaterEngine;
        const tile = findNearestLightTile(eng.specialTiles, caster);
        const dest = tile ? lightTileCenter(tile) : { x: caster.x, y: caster.y };
        const payload: LightEaterPayload = { tileId: tile?.id ?? null, x: dest.x, y: dest.y };
        active.castPayload = payload;
    },

    doCardEffect(
        engine: unknown,
        caster: Unit,
        _targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void {
        const eng = engine as LightEaterEngine;
        const payload = readLightEaterPayload(active);
        const pulse = { colors: [DARK_PURPLE, 0x330055, 0x110022] };

        // Takeoff: reuse the knockback airborne mechanism (straight line, constant speed, arc and
        // ground shadow rendering, terrain-ignoring) aimed at the pre-resolved light.
        if (prevTime < LIGHT_EATER_WINDUP_TIME && currentTime >= LIGHT_EATER_WINDUP_TIME && payload?.tileId) {
            eng.addEffect(new Effect({ x: caster.x, y: caster.y, duration: 0.5, effectType: 'Pulse', effectData: pulse }));
            caster.applyKnockback(
                {
                    knockbackVector: { x: payload.x - caster.x, y: payload.y - caster.y },
                    knockbackAirTime: LIGHT_EATER_FLIGHT_TIME,
                    knockbackSlideTime: 0,
                    knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
                    passThroughTerrain: true,
                },
                eng.eventBus,
            );
        }

        // Landing: land exactly on the light, then devour it, heal, and gain super.
        if (prevTime < LIGHT_EATER_LANDING_TIME && currentTime >= LIGHT_EATER_LANDING_TIME && payload?.tileId) {
            caster.knockback = null;
            caster.x = payload.x;
            caster.y = payload.y;
            caster.clearMovement();
            const tile = eng.specialTiles.find((t) => t.id === payload.tileId);
            if (tile) devourLight(eng, tile);
            // Boss self-heal: no heal-penalty injury (penalty 0). Heals again when the blast fires.
            applyHeal(caster, LIGHT_EATER_HEAL, 0);
            caster.getResource('super')?.add(LIGHT_EATER_SUPER_GAIN);
            eng.addEffect(new Effect({ x: payload.x, y: payload.y, duration: 0.5, effectType: 'Pulse', effectData: pulse }));
        }

        if (prevTime < LIGHT_EATER_EXPLODE_TIME && currentTime >= LIGHT_EATER_EXPLODE_TIME) {
            const center = { x: caster.x, y: caster.y };
            damageEnemiesInCircle({
                engine: eng as never,
                caster,
                center,
                radius: LIGHT_EATER_EXPLOSION_RADIUS,
                damage: LIGHT_EATER_EXPLOSION_DAMAGE,
                abilityId: CARD_ID,
                attackType: 'melee',
            });
            // The blast also eats every other light in its radius, player-placed ones included.
            devourLightsInRadius(eng, center, LIGHT_EATER_EXPLOSION_RADIUS, payload?.tileId ?? null);
            // Heal and ring of Displacer Bolts, only when this cast actually devoured a light.
            if (payload?.tileId) {
                applyHeal(caster, LIGHT_EATER_HEAL, 0);
                const ringCount = hasUnitTag(caster, UnitTag.Enraged)
                    ? LIGHT_EATER_RING_PROJECTILES * LIGHT_EATER_ENRAGED_RING_MULTIPLIER
                    : LIGHT_EATER_RING_PROJECTILES;
                const step = (Math.PI * 2) / ringCount;
                for (let i = 0; i < ringCount; i++) {
                    const angle = LIGHT_EATER_RING_ROTATION + i * step;
                    spawnDisplacerBoltProjectile(eng, caster, Math.cos(angle), Math.sin(angle));
                }
            }
            eng.addEffect(new Effect({
                x: center.x,
                y: center.y,
                duration: 0.4,
                effectType: 'Explosion',
                effectRadius: LIGHT_EATER_EXPLOSION_RADIUS,
                effectProperties: { color: DARK_PURPLE, direction: 'expand' },
            }));
        }
    },

    /** Forecast circle at the light, from cast start until the explosion fires. */
    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = getCastElapsedAt(activeAbility, gameTime);
        if (elapsed < 0 || elapsed >= LIGHT_EATER_EXPLODE_TIME) return;
        const payload = readLightEaterPayload(activeAbility) ?? { tileId: null, x: caster.x, y: caster.y };
        const t = elapsed / LIGHT_EATER_EXPLODE_TIME;
        const fillRadius = Math.max(2, t * LIGHT_EATER_EXPLOSION_RADIUS);
        gr.circle(payload.x, payload.y, LIGHT_EATER_EXPLOSION_RADIUS);
        gr.stroke({ color: TELEGRAPH_RED, width: 2, alpha: 0.35 + 0.55 * t });
        gr.circle(payload.x, payload.y, fillRadius);
        gr.fill({ color: DARK_PURPLE, alpha: 0.25 + 0.3 * t });
        gr.circle(payload.x, payload.y, fillRadius);
        gr.stroke({ color: DARK_PURPLE, width: 3, alpha: 0.45 + 0.45 * t });
    },
};

export const LightEaterCard: CardDef = {
    abilityId: CARD_ID,
};
