/**
 * AlphaWolfClaw - Alpha Wolf boss melee ability.
 * Hits in a square in front of the caster. 0.8s windup, punch effect, moderate knockback.
 * Damage similar to wolf bite. Max 2 uses per round.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility } from '../../../game/types';
import { type CardDef } from '../../types';
import { Effect } from '../../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { getPixelTargetPosition } from '../../../abilities/targetHelpers';
import { drawEnemyConvexQuadHitboxTelegraph } from '../../../abilities/previewHelpers';
import { convexQuadHitbox } from '../../../hitboxes/ConvexQuadHitbox';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}04`;
const PREFIRE_TIME = 0.8;
const ACTIVE_DURATION = 0.1;
const COOLDOWN_DURATION = 1.5;
const ACTIVE_END = PREFIRE_TIME + ACTIVE_DURATION;
const TOTAL_DURATION = ACTIVE_END + COOLDOWN_DURATION;
const DAMAGE = 15;
const CLAW_EFFECT_DURATION = 0.4;
const KNOCKBACK_TIER = 2;
/** Square side length (px) for hitbox and preview. */
const BOX_SIZE = 44;
const REACH = 40;
/** Match brief active phase after prefire so the outline stays fully red through impact. */
const CLAW_PREVIEW_HOLD_RED = 0.12;

const HITBOX = convexQuadHitbox(REACH, BOX_SIZE);

const SWING_BEHAVIOUR = CastBehaviours.MeleeAttack()
    .withHitbox(HITBOX)
    .withDamage(DAMAGE, { attackType: 'melee' })
    .withKnockback(KNOCKBACK_TIER)
    .withImpactAt(0.0)
    .withSlide({ forwardDistance: 12, backwardDistance: 0 })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const { corners, centerX, centerY } = HITBOX.getQuadGeometry(ctx.caster, { x: aimX, y: aimY });
        ctx.engine.addEffect(
            new Effect({
                x: centerX + (corners[2]!.x - centerX) * 0.5,
                y: centerY + (corners[2]!.y - centerY) * 0.5,
                duration: CLAW_EFFECT_DURATION,
                effectType: 'punch',
                startX: corners[0]!.x,
                startY: corners[0]!.y,
            }),
        );
    });

const CLAW_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 40 L28 28 L36 36 L44 24 M24 44 L32 32 L40 40" stroke="#5d4e37" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="12" fill="#2d2d2d" stroke="#1a1a1a"/>
</svg>`;

export const AlphaWolfClawAbility = defineAbility({
    id: CARD_ID,
    name: 'Alpha Wolf Claw',
    image: CLAW_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'pixel', label: 'Target point' }],
    abilityTimings: [
        { id: 'windup',   start: 0,           end: PREFIRE_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: PREFIRE_TIME,
            end: ACTIVE_END,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Target', hitbox: HITBOX, filter: 'enemy', allowMiss: true },
            behaviour: SWING_BEHAVIOUR,
        },
        {
            id: 'cooldown',
            start: ACTIVE_END,
            end: TOTAL_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    aiSettings: {
        minRange: 0,
        maxRange: HITBOX.maxRange,
        maxUsesPerRound: 2,
        priority: 10,
    },
    movementLock: { until: ACTIVE_END },
    getTooltipText(_gameState?: unknown): string[] {
        return [`Slash in a square in front, dealing {${DAMAGE}} damage and knocking back enemies.`];
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        const pos = getPixelTargetPosition(activeAbility.targets, 0);
        if (!pos) return;
        const { corners, centerX, centerY } = HITBOX.getQuadGeometry(caster, pos);
        drawEnemyConvexQuadHitboxTelegraph(gr, corners, centerX, centerY, elapsed, PREFIRE_TIME, {
            holdFullRedUntilOffset: CLAW_PREVIEW_HOLD_RED,
        });
    },
});

export const AlphaWolfClawCard: CardDef = {
    abilityId: CARD_ID,
};
