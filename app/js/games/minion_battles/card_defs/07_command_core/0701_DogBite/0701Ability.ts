/**
 * DogBite — the dog's basic melee attack.
 * A quick snap that the pet AI auto-uses when engaging. Slightly faster windup
 * than a swarmling bite so the dog feels reactive rather than lumbering. Deals
 * modest damage; its value comes from the AI chaining it on every engage tick.
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

const CARD_ID = `${formatGroupId(AbilityGroupId.Command)}01`;
const PREFIRE_TIME = 0.6;
const MAX_RANGE = 30;
const LINE_THICKNESS = 20;
const DAMAGE = 2;
const CIRCLE_START_RADIUS = 18;

const BITE_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS);

const biteBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(BITE_HITBOX)
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
    { id: 'bite',     start: PREFIRE_TIME,   end: PREFIRE_TIME + 0.1, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target', hitbox: BITE_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: biteBehaviour },
    { id: 'cooldown', start: PREFIRE_TIME + 0.1, end: PREFIRE_TIME + 0.9, abilityPhase: AbilityPhase.Cooldown },
];

interface BitePayload {
    targetX: number;
    targetY: number;
}

const BITE_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="22" fill="#1a1205" stroke="#3d2a0a" stroke-width="2"/>
  <path d="M18 24 L23 32 M27 22 L31 30 M35 22 L31 30 M41 24 L37 32" stroke="#c8822a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M18 38 Q32 50 46 38" stroke="#c8822a" stroke-width="2" fill="none"/>
  <circle cx="32" cy="32" r="4" fill="none" stroke="#c8822a" stroke-width="1.5" stroke-dasharray="2,2"/>
</svg>`;

export const DogBiteAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Dog Bite',
    image: BITE_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'unit', label: 'Target' }],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: BITE_HITBOX.maxRange, priority: 0 },

    getTooltipText(): string[] {
        return [`Snap at the target for {${DAMAGE}} damage.`];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < PREFIRE_TIME + 0.1) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: BITE_HITBOX.maxRange };
    },

    beginActiveCast(_engine: unknown, _caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        const t = targets[0];
        if (t?.type === 'unit' && t.unitId) {
            const eng = _engine as { getUnit(id: string): Unit | undefined };
            const u = eng.getUnit(t.unitId);
            if (u) {
                active.castPayload = { targetX: u.x, targetY: u.y } satisfies BitePayload;
            }
        }
    },

    renderActivePreview(gr: IAbilityPreviewGraphics, caster: Unit, activeAbility: ActiveAbility, gameTime: number): void {
        const payload = activeAbility.castPayload as BitePayload | undefined;
        if (!payload) return;

        const elapsed = gameTime - activeAbility.startTime;
        const progress = Math.min(1, elapsed / PREFIRE_TIME);
        const circleRadius = CIRCLE_START_RADIUS * (1 - progress);

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(payload.targetX, payload.targetY);
        gr.stroke({ color: 0xff8800, width: 2, alpha: 0.75 });

        if (circleRadius > 0.5) {
            gr.circle(payload.targetX, payload.targetY, circleRadius);
            gr.stroke({ color: 0xff8800, width: 2, alpha: 0.8 });
        }
    },

    onAttackBlocked(): void {},
};

export const DogBiteCard: CardDef = {
    abilityId: CARD_ID,
};
