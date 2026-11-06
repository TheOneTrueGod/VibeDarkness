/**
 * Shard Nova - Court Magician. He raises both hands; every crystal flares and sprouts a crown of
 * spokes, then bursts into a ring of slow dark shards. Neighbouring crystals fire offset rings, so the
 * rings interleave into a field the party has to thread through, and where the crystals were just
 * placed decides where the field is thickest. Enraged, each ring has half again as many shards.
 */

import type {
    AbilityStatic,
    ActivePreviewEngineContext,
    AttackBlockedInfo,
    IAbilityPreviewGraphics,
} from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { TargetDef } from '../../../abilities/targeting';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { fireProjectileRing, projectileRingDirections } from '../../../abilities/projectileRing';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { Effect } from '../../../game/effects/Effect';
import { Projectile } from '../../../game/projectiles/Projectile';
import { TerrainType } from '../../../terrain/TerrainType';
import { DARK_SHARD_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/darkShardDef';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { getBoundUnits } from '../../../game/units/boundUnits';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { getCastElapsedAt } from '../../../game/time/actorClock';
import type { CardDef } from '../../types';
import {
    COURT_CRYSTAL_ID,
    COURT_ORCHID,
    COURT_PULSE_COLORS,
    COURT_TELEGRAPH_RED,
    SHARD_NOVA_ABILITY_ID,
} from '../courtMagicianConstants';
import IMAGE from './shardNova.svg?raw';

/** Shards per crystal ring. */
export const SHARD_NOVA_RING_COUNT = 8;
/** Shards per crystal ring while enraged. */
export const SHARD_NOVA_ENRAGED_RING_COUNT = 12;
export const SHARD_NOVA_DAMAGE = 2;
/** Slow on purpose: the field should be dodgeable by walking. */
export const SHARD_NOVA_SPEED = 150;
export const SHARD_NOVA_TRAVEL_DISTANCE = 420;
export const SHARD_NOVA_RADIUS = 5;
/** Shards stop on rock and chip it: a full rock breaks after this many shards. */
export const SHARD_NOVA_ROCK_HITS_TO_BREAK = 6;

export const SHARD_NOVA_WINDUP_SEC = 1.1;
const FIRE_END = SHARD_NOVA_WINDUP_SEC + 1 / 60;
const COOLDOWN_END = FIRE_END + 0.6;
export const SHARD_NOVA_AI_RANGE = 520;

export interface ShardNovaPayload {
    /** Ring rotation of the first crystal (radians); each next crystal is offset by half a step. */
    rotation: number;
    /** Crystal positions at cast start (telegraph fallback when a crystal cannot be looked up). */
    crystals: { x: number; y: number }[];
    /** Crystal ids in ring order, so the telegraph follows crystals that move during the windup (ramming). */
    crystalIds?: string[];
}

function readPayload(active: { castPayload?: unknown } | undefined): ShardNovaPayload | null {
    const p = active?.castPayload as Partial<ShardNovaPayload> | undefined;
    return p && typeof p.rotation === 'number' && Array.isArray(p.crystals) ? (p as ShardNovaPayload) : null;
}

/** Shards per ring for this caster right now. */
export function shardNovaRingCount(caster: Unit): number {
    return hasUnitTag(caster, UnitTag.Enraged) ? SHARD_NOVA_ENRAGED_RING_COUNT : SHARD_NOVA_RING_COUNT;
}

/** Ring rotation for the crystal at `index`: half-step offsets so neighbouring rings interleave. */
export function shardNovaRingRotation(base: number, index: number, count: number): number {
    return base + (index % 2) * (Math.PI / count);
}

/** One dark shard from `from`, owned by `caster` (team and damage attribution). */
export function spawnDarkShard(
    engine: Pick<AbilityEngineContext, 'addProjectile'>,
    caster: Unit,
    from: { x: number; y: number },
    dirX: number,
    dirY: number,
): Projectile {
    const projectile = new Projectile({
        x: from.x,
        y: from.y,
        velocityX: dirX * SHARD_NOVA_SPEED,
        velocityY: dirY * SHARD_NOVA_SPEED,
        damage: SHARD_NOVA_DAMAGE,
        sourceTeamId: caster.teamId,
        sourceUnitId: caster.id,
        sourceAbilityId: SHARD_NOVA_ABILITY_ID,
        maxDistance: SHARD_NOVA_TRAVEL_DISTANCE,
        projectileType: DARK_SHARD_PROJECTILE_TYPE,
        collidesWithTerrain: [TerrainType.Rock],
        rockHitsToBreak: SHARD_NOVA_ROCK_HITS_TO_BREAK,
    });
    projectile.radius = SHARD_NOVA_RADIUS;
    engine.addProjectile(projectile);
    return projectile;
}

function burst(ctx: CastBehaviourTickContext): void {
    const payload = readPayload({ castPayload: ctx.castPayload });
    const base = payload?.rotation ?? 0;
    const count = shardNovaRingCount(ctx.caster);
    getBoundUnits(ctx.engine.units, ctx.caster, COURT_CRYSTAL_ID).forEach((crystal, i) => {
        fireProjectileRing({ count, rotation: shardNovaRingRotation(base, i, count) }, (dx, dy) =>
            spawnDarkShard(ctx.engine, ctx.caster, crystal, dx, dy),
        );
        ctx.engine.addEffect(
            new Effect({
                x: crystal.x,
                y: crystal.y,
                duration: 0.35,
                effectType: 'Pulse',
                effectData: { colors: [...COURT_PULSE_COLORS] },
            }),
        );
    });
}

const _base: AbilityStatic = defineAbility({
    id: SHARD_NOVA_ABILITY_ID,
    name: 'Shard Nova',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 2,
    prefireTime: SHARD_NOVA_WINDUP_SEC,
    abilityTimings: [
        { id: 'gather', start: 0, end: SHARD_NOVA_WINDUP_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'burst',
            start: SHARD_NOVA_WINDUP_SEC,
            end: FIRE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(burst) }],
        },
        { id: 'cooldown', start: FIRE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: SHARD_NOVA_AI_RANGE,
        maxUsesPerRound: 2,
        priority: 20,
        ninjutsu: { ignore: true },
        enforceRangeWhenUntargeted: true,
        canUse: (caster, ctx) => getBoundUnits(ctx.getUnits(), caster, COURT_CRYSTAL_ID).length > 0,
    },
    getRange: () => ({ minRange: 0, maxRange: SHARD_NOVA_AI_RANGE }),
    getTooltipText(): string[] {
        return [
            `Every crystal bursts into a ring of ${SHARD_NOVA_RING_COUNT} slow dark shards (${SHARD_NOVA_ENRAGED_RING_COUNT} when enraged), {${SHARD_NOVA_DAMAGE}} damage each`,
            'Neighbouring rings are offset, so the shards interleave into a field',
            `Shards stop on rock and chip it (${SHARD_NOVA_ROCK_HITS_TO_BREAK} shards break a rock)`,
        ];
    },
});

export const ShardNovaAbility_1402: AbilityStatic = {
    ..._base,

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as AbilityEngineContext;
        const payload: ShardNovaPayload = {
            rotation: (eng.generateRandomInteger(0, 359) * Math.PI) / 180,
            crystals: getBoundUnits(eng.units, caster, COURT_CRYSTAL_ID).map((c) => ({ x: c.x, y: c.y })),
            crystalIds: getBoundUnits(eng.units, caster, COURT_CRYSTAL_ID).map((c) => c.id),
        };
        active.castPayload = payload;
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    /** Each crystal grows a crown of spokes along its shard directions, brightening until the burst. */
    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        active: ActiveAbility,
        gameTime: number,
        engine?: ActivePreviewEngineContext,
    ): void {
        const elapsed = getCastElapsedAt(active, gameTime);
        if (elapsed < 0 || elapsed >= SHARD_NOVA_WINDUP_SEC) return;
        const payload = readPayload(active);
        if (!payload) return;
        const t = elapsed / SHARD_NOVA_WINDUP_SEC;
        const count = shardNovaRingCount(caster);
        const inner = 14;
        const outer = inner + 8 + 22 * t;
        payload.crystals.forEach((stored, i) => {
            // Spokes ride on the crystal: one still ramming from Crystal Volley carries its charge along.
            const id = payload.crystalIds?.[i];
            const live = id ? engine?.getUnit?.(id) : undefined;
            const c = live?.isAlive() ? live : stored;
            for (const d of projectileRingDirections({ count, rotation: shardNovaRingRotation(payload.rotation, i, count) })) {
                gr.moveTo(c.x + d.x * inner, c.y + d.y * inner);
                gr.lineTo(c.x + d.x * outer, c.y + d.y * outer);
            }
            gr.stroke({ color: t > 0.7 ? COURT_TELEGRAPH_RED : COURT_ORCHID, width: 2, alpha: 0.35 + 0.5 * t });
        });
    },
};

export const ShardNovaCard_1402: CardDef = { abilityId: SHARD_NOVA_ABILITY_ID };
