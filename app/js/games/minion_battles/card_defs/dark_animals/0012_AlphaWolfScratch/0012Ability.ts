/**
 * AlphaWolfScratch - Alpha Wolf fallback melee ability.
 * A desperate raking swipe the wolf uses after its primary toolkit is exhausted.
 * Slow 1s windup telegraphed by a narrowing red circle at the target; deals minimal
 * damage, but gives the boss a reliable filler attack so it is never truly passive.
 */

import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityState } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { meleeLineHitbox } from '../../../hitboxes';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}12`;
const PREFIRE_TIME = 1.0;
const MAX_RANGE = 30;
const LINE_THICKNESS = 20;
const DAMAGE = 2;
/** Starting radius of the shrinking windup circle (px). */
const CIRCLE_START_RADIUS = 18;

const SCRATCH_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS);

const scratchBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(SCRATCH_HITBOX)
    .withImpact('punch')
    .withSlide({ forwardDistance: 8, backwardDistance: 0 })
    .withDamage((_ctx, hitUnits) => {
        const target = hitUnits[0];
        if (!target) return;
        tryDamageOrBlock(target, {
            engine: _ctx.engine,
            gameTime: _ctx.engine.gameTime,
            eventBus: _ctx.engine.eventBus,
            attackerX: _ctx.caster.x,
            attackerY: _ctx.caster.y,
            attackerId: _ctx.caster.id,
            abilityId: CARD_ID,
            damage: DAMAGE,
            attackType: 'melee',
        });
    });

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,              end: PREFIRE_TIME,       abilityPhase: AbilityPhase.Windup },
    { id: 'scratch',  start: PREFIRE_TIME,   end: PREFIRE_TIME + 0.1, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target', hitbox: SCRATCH_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: scratchBehaviour },
    { id: 'cooldown', start: PREFIRE_TIME + 0.1, end: PREFIRE_TIME + 1.1, abilityPhase: AbilityPhase.Cooldown },
];

interface ScratchPayload {
    targetX: number;
    targetY: number;
}

const SCRATCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1a2e" stroke="#3a1a1a" stroke-width="2"/>
  <path d="M20 18 L36 38 M26 16 L38 36 M32 14 L40 34" stroke="#8b3a3a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
</svg>`;

export const AlphaWolfScratchAbility: AbilityStatic = {
    image: SCRATCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'unit', label: 'Target' }],
    abilityTimings: ABILITY_TIMINGS,
    // maxRange: line extends MAX_RANGE (30) from caster; target is hit when within target.radius + LINE_THICKNESS (20+20=40) of that endpoint.
    // Full hit range from caster centre = 30 + 20 + 20 = 70. Use that so the AI actually tries the ability.
    aiSettings: { minRange: 0, maxRange: MAX_RANGE + LINE_THICKNESS + 20, priority: -10 },

    getTooltipText(): string[] {
        return [`Rake the target for {${DAMAGE}} damage.`];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < PREFIRE_TIME + 0.1) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: SCRATCH_HITBOX.maxRange };
    },

    beginActiveCast(_engine: unknown, _caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        console.log('[Scratch] beginActiveCast', _caster.id, targets);
        const t = targets[0];
        if (t?.type === 'unit' && t.unitId) {
            const eng = _engine as { getUnit(id: string): Unit | undefined };
            const u = eng.getUnit(t.unitId);
            if (u) {
                active.castPayload = { targetX: u.x, targetY: u.y } satisfies ScratchPayload;
            }
        }
    },

    renderActivePreview(gr: IAbilityPreviewGraphics, caster: Unit, activeAbility: ActiveAbility, gameTime: number): void {
        const payload = activeAbility.castPayload as ScratchPayload | undefined;
        if (!payload) return;

        const elapsed = gameTime - activeAbility.startTime;
        const progress = Math.min(1, elapsed / PREFIRE_TIME);
        const circleRadius = CIRCLE_START_RADIUS * (1 - progress);

        // Aim line from caster to target
        gr.moveTo(caster.x, caster.y);
        gr.lineTo(payload.targetX, payload.targetY);
        gr.stroke({ color: 0xff0000, width: 2, alpha: 0.75 });

        // Shrinking circle at target
        if (circleRadius > 0.5) {
            gr.circle(payload.targetX, payload.targetY, circleRadius);
            gr.stroke({ color: 0xff0000, width: 2, alpha: 0.8 });
        }
    },

    onAttackBlocked(): void {
        // Melee blocked: no additional behaviour.
    },
};

export const AlphaWolfScratchCard: CardDef = {
    abilityId: CARD_ID,
};
