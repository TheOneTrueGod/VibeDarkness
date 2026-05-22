/**
 * Double Punch - Warrior melee ability.
 *
 * Strikes twice in sequence, each using a thick-line hitbox with lock-on targeting.
 * Built entirely on the CastBehaviours system (no doCardEffect / beginActiveCast).
 */

import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { HitboxDef } from '../../abilities/hitboxDef';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { ThickLineHitbox } from '../../hitboxes';
import { getAimPointClampedToMaxRange } from '../../abilities/targetHelpers';
import { buildHitboxContext, renderMeleeTrackingHighlights } from '../../abilities/meleeTrackingHelpers';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}16`;
const MAX_RANGE = 30; // px
const LINE_THICKNESS = 20; // px
const PUNCH_DAMAGE = 8;

const PUNCH_HITBOX: HitboxDef = { shape: 'meleeLine', range: MAX_RANGE, thickness: LINE_THICKNESS };

const punchBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(PUNCH_HITBOX)
    .withImpact('punch')
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
            damage: PUNCH_DAMAGE,
            attackType: 'melee',
        });
    });

const TARGET_DEF: TargetDef = {
    label: 'Target point',
    lockOn: { hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
};

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,    end: 0.15, abilityPhase: AbilityPhase.Windup },
    { id: 'punch1',   start: 0.15, end: 0.55, abilityPhase: AbilityPhase.Active,
      castBehaviours: [{ timingStart: 'start', timingEnd: 'end', targetIndex: 0, behaviour: punchBehaviour }] },
    { id: 'gap',      start: 0.55, end: 0.65, abilityPhase: AbilityPhase.Active },
    { id: 'punch2',   start: 0.65, end: 1.10, abilityPhase: AbilityPhase.Active,
      castBehaviours: [{ timingStart: 'start', timingEnd: 'end', targetIndex: 1, behaviour: punchBehaviour }] },
    { id: 'cooldown', start: 1.10, end: 1.40, abilityPhase: AbilityPhase.Cooldown },
];

const PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#222222"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <!-- Circular badge background -->
  <circle cx="32" cy="32" r="22" fill="url(#fistBg)" stroke="#facc15" stroke-width="3"/>

  <!-- Stylized raised fist (resist symbol) -->
  <!-- Fingers -->
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <!-- Thumb overlapping -->
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#d4d4d4" stroke="#111827" stroke-width="1.5"/>

  <!-- Palm -->
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#e5e5e5" stroke="#111827" stroke-width="1.8"/>

  <!-- Wrist / arm -->
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>

  <!-- Accent rays to suggest impact / defiance -->
  <path d="M14 18 L20 22" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 12 L32 18" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const DoublePunchAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Double Punch',
    image: PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    tags: [],
    prefireTime: 0.15,
    targets: [TARGET_DEF, TARGET_DEF],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },

    getTooltipText(): string[] {
        return ['Hit {2} enemies in sequence for {8} damage each'];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        // Lock movement through both strikes; release during cooldown.
        if (currentTime < 1.10) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_RANGE + caster.radius };
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): void {
        const maxR = MAX_RANGE + caster.radius;
        const aimAtMax = getAimPointClampedToMaxRange(caster, mouseWorld, maxR);
        ThickLineHitbox.renderTargetingPreview(gr, caster, aimAtMax, maxR, LINE_THICKNESS);
        const ctx = buildHitboxContext(units);
        const hits = ThickLineHitbox.getUnitsInHitbox(ctx, caster, caster.x, caster.y, aimAtMax.x, aimAtMax.y, LINE_THICKNESS);
        if (hits.length > 0) {
            hits.sort((a, b) => {
                const da = (a.x - mouseWorld.x) ** 2 + (a.y - mouseWorld.y) ** 2;
                const db = (b.x - mouseWorld.x) ** 2 + (b.y - mouseWorld.y) ** 2;
                return da - db;
            });
            renderMeleeTrackingHighlights(gr, [hits[0]!]);
        }
    },

    onAttackBlocked(): void {
        // Melee blocked: no additional behaviour.
    },
};
