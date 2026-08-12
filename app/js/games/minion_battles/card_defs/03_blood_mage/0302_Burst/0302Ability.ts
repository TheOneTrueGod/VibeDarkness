/**
 * Burst — release a violent cone of blood magic at the caster's own expense, tearing into
 * everything in its arc. See `../AGENTS.md` for the full Blood Mage design intent. Modeled on
 * `card_defs/0121_ConeOfLight/0121Ability.ts` (cone hitbox), but with its own range/angle
 * constants and a blood-mist windup instead of a flash telegraph.
 *
 * The cone hitbox (`BURST_HITBOX`) is still used for targeting — the aim preview and the
 * `select` targetDef's allowed-target filter — but the actual damage is no longer an instant
 * hit. Instead, a growing rectangular "wave" `Projectile` (`hitShape: 'rect'`) is fired from
 * (caster position + caster radius) toward the aim point, sweeping out from `startWidth` to
 * `endWidth` — the cone's width at the wave's start distance and at `RANGE` respectively — over
 * `BURST_WAVE_TRAVEL_DURATION` seconds. Because width scales linearly with distance from the
 * caster exactly as the cone's does, the wave's swept area is the same cone, just traversed
 * over time instead of resolved instantly.
 */

import type { AbilityRecoveryRule, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { HitboxSpec } from '../../../hitboxes/HitboxSpec';
import type { HitboxEngineContext, HitboxPreviewCaster } from '../../../hitboxes';
import type { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { Projectile } from '../../../game/projectiles/Projectile';
import { getDirectionFromTo, pointInCone } from '../../../abilities/targetHelpers';
import { resolveTargetToPoint, findMeleeAimPixelInTargets } from '../../../abilities/targeting';
import { areEnemies } from '../../../game/teams';
import { drawConeSlice } from '../../../abilities/previewHelpers';
import { spawnBloodMistWindupBurst } from '../../../abilities/bloodMageVfx';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Mage)}02`;

// Own range/angle constants — deliberately not shared with 0121_ConeOfLight's, per the
// "don't touch or parametrize the original" instruction in the Burst plan step.
export const BURST_RANGE = 200;
export const BURST_HALF_ANGLE_RAD = Math.PI / 6; // 60 degree total arc.
export const BURST_DAMAGE = 10; // Matches Cone of Light's own damage value — see plan-level decisions.
export const BURST_MAX_TARGETS = 4;
export const BURST_HP_COST = 5;
// Longer than the ~0.2-0.4s norm — consistent with the archetype's exposed-windup feel (AGENTS.md).
export const BURST_WINDUP_DURATION = 0.6;
export const BURST_ACTIVE_DURATION = 0.1;
export const BURST_COOLDOWN_DURATION = 0.5;
// How long the wave takes to travel from its spawn point out to RANGE.
export const BURST_WAVE_TRAVEL_DURATION = 0.5;
// Keep the wave flying (and animating) out to RANGE even after it's used up all its pierce
// hits, instead of stopping dead the instant it lands its last hit — Burst is the only
// ability that currently wants this "keep animating" behavior on its projectile.
export const BURST_CONTINUE_AFTER_MAX_TARGETS = true;
export const BURST_KNOCKBACK_TIER = 2;
const RANGE = BURST_RANGE;
const HALF_ANGLE_RAD = BURST_HALF_ANGLE_RAD;
const DAMAGE = BURST_DAMAGE;
const MAX_TARGETS = BURST_MAX_TARGETS;
const HP_COST = BURST_HP_COST;
const WINDUP_DURATION = BURST_WINDUP_DURATION;
const ACTIVE_DURATION = BURST_ACTIVE_DURATION;
const COOLDOWN_DURATION = BURST_COOLDOWN_DURATION;
const WAVE_TRAVEL_DURATION = BURST_WAVE_TRAVEL_DURATION;
const KNOCKBACK_TIER = BURST_KNOCKBACK_TIER;
const PREVIEW_FILL_COLOR = 0x8b1220;
const PREVIEW_STROKE_COLOR = 0x1a0508;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

class BurstHitboxSpec extends HitboxSpec {
    get maxRange(): number { return RANGE; }
    override get numTargets(): number { return MAX_TARGETS; }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const centerAngle = Math.atan2(dy, dx);
        const dirX = dx / dist;
        const dirY = dy / dist;
        gr.clear();
        drawConeSlice(gr, caster.x, caster.y, centerAngle, HALF_ANGLE_RAD, 0, RANGE, {
            fillColor: PREVIEW_FILL_COLOR,
            fillAlpha: 0.25,
            strokeColor: PREVIEW_STROKE_COLOR,
            strokeAlpha: 0.8,
        });
        return units.filter(
            (u) => u.isAlive() &&
                pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, RANGE, HALF_ANGLE_RAD),
        );
    }

    resolveTargets(caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]): Unit[] {
        const dx = aimPoint.x - caster.x;
        const dy = aimPoint.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const dirX = dx / dist;
        const dirY = dy / dist;
        return units.filter(
            (u) => u.id !== caster.id && u.isAlive() &&
                pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, RANGE, HALF_ANGLE_RAD),
        );
    }

    resolveHits(engine: HitboxEngineContext, caster: Unit, aimX: number, aimY: number): Unit[] {
        const dx = aimX - caster.x;
        const dy = aimY - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const dirX = dx / dist;
        const dirY = dy / dist;
        const hits: Unit[] = [];
        for (const u of engine.units) {
            if (u.id === caster.id || !u.isAlive()) continue;
            if (!areEnemies(caster.teamId, u.teamId)) continue;
            if (pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, RANGE, HALF_ANGLE_RAD)) {
                hits.push(u);
            }
        }
        hits.sort((a, b) =>
            Math.hypot(a.x - caster.x, a.y - caster.y) - Math.hypot(b.x - caster.x, b.y - caster.y),
        );
        return hits;
    }
}

const BURST_HITBOX = new BurstHitboxSpec();

const BURST_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="burstGlow" cx="0.35" cy="0.5" r="0.65">
      <stop offset="0%" stop-color="#f87171"/>
      <stop offset="55%" stop-color="#7f1d1d"/>
      <stop offset="100%" stop-color="#1a0508" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <path d="M14 32 L48 14 L38 30 L52 30 L20 52 L30 34 Z" fill="url(#burstGlow)" stroke="#fca5a5" stroke-width="1.5"/>
</svg>`;

const TOOLTIP_LINES = [
    'Release a violent burst of blood magic at your own expense.',
    'Deals {{DAMAGE}} damage to up to {{MAX_TARGETS}} cone. {{KNOCKBACK}}.',
    'Costs {{HP_COST}} HP to cast.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MAX_TARGETS },
    KNOCKBACK: { kind: 'knockback', tier: KNOCKBACK_TIER },
    HP_COST: { kind: 'plain', value: HP_COST },
};

export const BurstAbility_0302 = defineAbility({
    id: CARD_ID,
    name: 'Burst',
    image: BURST_IMAGE,
    resourceCost: null,
    hpCost: HP_COST,
    // No hpCostGate override — default 'requireSurplus' (must have hp > HP_COST to cast).
    rechargeTurns: 1,
    maxUses: 3,
    recoveries: RECOVERIES,
    prefireTime: WINDUP_DURATION,
    aiSettings: { minRange: 0, maxRange: RANGE },
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: WINDUP_DURATION,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        spawnBloodMistWindupBurst(ctx.engine as EngineContext, ctx.caster, { variant: 'burst' });
                    }),
                },
            ],
        },
        {
            id: 'active',
            start: WINDUP_DURATION,
            end: WINDUP_DURATION + ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Direction',
                hitbox: BURST_HITBOX,
                filter: 'enemy',
                allowMiss: true,
                lockOnMode: 'strictHitbox',
            },
            castBehaviours: [
                {
                    // Deducting the HP cost lives in its own Instant behaviour alongside the
                    // wave-spawning behaviour in the same window — both fire independently
                    // (keyed by behaviour index), so no separate leading interval is needed.
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        // Gated by hpCost's default 'requireSurplus' (hp > HP_COST to cast),
                        // so a flat deduction is safe — no floorAtOne clamp needed here
                        // (contrast with Blood Mend 0301's payHpCostFloorAtOne).
                        ctx.caster.hp -= HP_COST;
                    }),
                },
                {
                    // Fires the wave instead of resolving the cone instantly — see the
                    // module doc comment for how startWidth/endWidth reconstruct the cone.
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        // Aim by the actual clicked pixel, not the lock-on target's live position —
                        // Burst's cone/wave direction is fixed at cast time, so it must not swing
                        // toward wherever a locked-on enemy has since moved. `ctx.target` can be a
                        // `unit` target (AbilityTargetingTool locks onto the first enemy in the
                        // cone on click), so prefer the trailing aim pixel that's always appended
                        // to `ctx.allTargets` for select targeting (see buildMeleeSelectOrderTargets).
                        const aimPoint = findMeleeAimPixelInTargets(ctx.allTargets) ??
                            resolveTargetToPoint(ctx.target, ctx.engine) ??
                            { x: ctx.caster.x, y: ctx.caster.y };
                        const { dirX, dirY } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, aimPoint.x, aimPoint.y);

                        const startDist = ctx.caster.radius;
                        const travelDistance = Math.max(1, RANGE - startDist);
                        const startWidth = 2 * startDist * Math.tan(HALF_ANGLE_RAD);
                        const endWidth = 2 * RANGE * Math.tan(HALF_ANGLE_RAD);
                        const speed = travelDistance / WAVE_TRAVEL_DURATION;

                        const wave = new Projectile({
                            x: ctx.caster.x + dirX * startDist,
                            y: ctx.caster.y + dirY * startDist,
                            velocityX: dirX * speed,
                            velocityY: dirY * speed,
                            damage: DAMAGE,
                            sourceTeamId: ctx.caster.teamId,
                            sourceUnitId: ctx.caster.id,
                            sourceAbilityId: CARD_ID,
                            maxDistance: travelDistance,
                            projectileType: 'blood_wave',
                            hitShape: 'rect',
                            rectStartWidth: startWidth,
                            rectEndWidth: endWidth,
                            knockbackTier: KNOCKBACK_TIER,
                            pierce: MAX_TARGETS - 1,
                            continueAfterMaxHits: BURST_CONTINUE_AFTER_MAX_TARGETS,
                        });
                        ctx.engine.addProjectile(wave);
                    }),
                },
            ],
        },
        { id: 'cooldown', start: WINDUP_DURATION + ACTIVE_DURATION, end: WINDUP_DURATION + ACTIVE_DURATION + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const BurstCard_0302: CardDef = {
    abilityId: CARD_ID,
};
