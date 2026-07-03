/**
 * Light Blast - Ranged AoE that damages enemies, heals allies, and plants a torch at the target.
 *
 * Targets a pixel within MAX_RANGE. Brief windup, then a burst of light in a circle
 * around the target point. Allies in the circle are healed; a torch light source is left behind.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { nullHitbox } from '../../../hitboxes';
import { spawnBrightLight, type EngineWithLight } from '../../../abilities/brightKeyword';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { damageEnemiesInCircle } from '../../../abilities/targetHelpers';
import { createMovementPenaltyStates } from '../../../abilities/shieldHelpers';
import { areEnemies } from '../../../game/teams';
import type { Unit } from '../../../game/units/Unit';

const CARD_ID = `${formatGroupId(AbilityGroupId.Light)}01`;
const MAX_USES = 3;
const PREFIRE_TIME = 0.4;
export const LIGHT_BLAST_MAX_RANGE = 200;
const MAX_RANGE = LIGHT_BLAST_MAX_RANGE;
const LIGHT_BLAST_RADIUS = 40;
export const LIGHT_BLAST_DAMAGE = 12;
export const LIGHT_BLAST_MAX_TARGETS = 5;
const LIGHT_BLAST_HEAL = 5;
const BRIGHT_MAGNITUDE = 3;

const LIGHT_BLAST_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="lightBlastCore" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#ff9900" stop-opacity="0.0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="28" fill="url(#lightBlastCore)" opacity="0.9"/>
  <line x1="32" y1="2"  x2="32" y2="14" stroke="#ffe066" stroke-width="3" stroke-linecap="round"/>
  <line x1="32" y1="50" x2="32" y2="62" stroke="#ffe066" stroke-width="3" stroke-linecap="round"/>
  <line x1="2"  y1="32" x2="14" y2="32" stroke="#ffe066" stroke-width="3" stroke-linecap="round"/>
  <line x1="50" y1="32" x2="62" y2="32" stroke="#ffe066" stroke-width="3" stroke-linecap="round"/>
  <line x1="10" y1="10" x2="18" y2="18" stroke="#ffe066" stroke-width="2" stroke-linecap="round"/>
  <line x1="46" y1="46" x2="54" y2="54" stroke="#ffe066" stroke-width="2" stroke-linecap="round"/>
  <line x1="54" y1="10" x2="46" y2="18" stroke="#ffe066" stroke-width="2" stroke-linecap="round"/>
  <line x1="18" y1="46" x2="10" y2="54" stroke="#ffe066" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const LightBlastAbility = defineAbility({
    id: CARD_ID,
    name: 'Light Blast',
    bright: BRIGHT_MAGNITUDE,
    image: LIGHT_BLAST_IMAGE,
    resourceCost: { resourceId: 'light', amount: 2 },
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'active',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 0.05,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Target', hitbox: nullHitbox, filter: 'any', allowMiss: true },
            onProjectileHit: [{
                type: 'effect',
                effectType: 'Explosion',
                effectProperties: { radius: LIGHT_BLAST_RADIUS, color: 0xffe066, direction: 'expand' },
                duration: 0.35,
                position: 'target',
            }],
            behaviour: CastBehaviours.Instant((ctx) => {
                const pos = ctx.target.position ?? { x: ctx.caster.x, y: ctx.caster.y };
                const eng = ctx.engine as EngineWithLight;

                damageEnemiesInCircle({
                    engine: eng,
                    caster: ctx.caster,
                    center: pos,
                    radius: LIGHT_BLAST_RADIUS,
                    damage: LIGHT_BLAST_DAMAGE,
                    abilityId: CARD_ID,
                    attackType: 'ranged',
                    maxTargets: LIGHT_BLAST_MAX_TARGETS,
                });

                for (const unit of eng.units) {
                    if (!unit.isAlive()) continue;
                    if (areEnemies(unit.teamId, ctx.caster.teamId)) continue;
                    const dx = unit.x - pos.x;
                    const dy = unit.y - pos.y;
                    if (dx * dx + dy * dy > LIGHT_BLAST_RADIUS * LIGHT_BLAST_RADIUS) continue;
                    unit.hp = Math.min(unit.maxHp, unit.hp + LIGHT_BLAST_HEAL);
                }

                spawnBrightLight(eng, pos.x, pos.y, BRIGHT_MAGNITUDE);
            }),
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME + 0.05,
            end: PREFIRE_TIME + 1.5,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    getAbilityStates: createMovementPenaltyStates(0.4, PREFIRE_TIME + 0.05),
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Create a sudden blast of light, dealing ${LIGHT_BLAST_DAMAGE} damage to up to ${LIGHT_BLAST_MAX_TARGETS} enemies.`,
            `Heals allies in the blast for ${LIGHT_BLAST_HEAL}.`,
            '{Bright 3}',
        ];
    },

    renderTargetingPreviewSelectedTargets(gr, caster, _targets, mouseWorld): void {
        gr.clear();
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.hypot(dx, dy);
        const scale = dist > MAX_RANGE ? MAX_RANGE / dist : 1;
        const tx = caster.x + dx * scale;
        const ty = caster.y + dy * scale;

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(tx, ty);
        gr.stroke({ color: 0xffd97a, alpha: 0.45, width: 1 });

        gr.circle(tx, ty, LIGHT_BLAST_RADIUS);
        gr.stroke({ color: 0xffd97a, alpha: 0.3, width: 2 });
    },
});

export const LightBlastCard: CardDef = {
    abilityId: CARD_ID,
};
