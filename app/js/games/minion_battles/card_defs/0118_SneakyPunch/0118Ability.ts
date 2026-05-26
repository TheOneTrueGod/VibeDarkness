/**
 * Sneaky Punch - Warrior melee ability.
 *
 * Deals bonus damage against stunned or bleeding targets.
 * Exclusive upgrade to Punch via the Training research tree.
 */

import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { HitboxDef } from '../../abilities/hitboxDef';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { Effect } from '../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { ThickLineHitbox } from '../../hitboxes';
import { getAimPointClampedToMaxRange } from '../../abilities/targetHelpers';
import { buildHitboxContext, renderMeleeTrackingHighlights } from '../../abilities/meleeTrackingHelpers';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { STUNNED_BUFF_TYPE } from '../../buffs/StunnedBuff';
import { BLEED_BUFF_TYPE } from '../../buffs/BleedBuff';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}18`;
const MAX_RANGE = 30; // px
const LINE_THICKNESS = 20; // px
const BASE_DAMAGE = 8;
// ~30% medium bonus on top of base = 10
const BONUS_DAMAGE = 12;
const BONUS_TOTAL = BASE_DAMAGE + BONUS_DAMAGE;

const PUNCH_HITBOX: HitboxDef = { shape: 'meleeLine', range: MAX_RANGE, thickness: LINE_THICKNESS };

const punchBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(PUNCH_HITBOX)
    .withImpact('punch')
    .withSlide({ forwardDistance: 12, backwardDistance: 6 })
    .withDamage((_ctx, hitUnits) => {
        const target = hitUnits[0];
        if (!target) return;
        const isVulnerable = target.hasBuff(STUNNED_BUFF_TYPE) || target.hasBuff(BLEED_BUFF_TYPE);
        const damage = isVulnerable ? BONUS_TOTAL : BASE_DAMAGE;
        const didHit = tryDamageOrBlock(target, {
            engine: _ctx.engine,
            gameTime: _ctx.engine.gameTime,
            eventBus: _ctx.engine.eventBus,
            attackerX: _ctx.caster.x,
            attackerY: _ctx.caster.y,
            attackerId: _ctx.caster.id,
            abilityId: CARD_ID,
            damage,
            attackType: 'melee',
        });
        if (didHit && isVulnerable) {
            _ctx.engine.addEffect(new Effect({
                x: target.x,
                y: target.y,
                duration: 0.3,
                effectType: 'CritShockwave',
            }));
        }
    });

const TARGET_DEF: TargetDef = {
    label: 'Target point',
    lockOn: { hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
};

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,    end: 0.15, abilityPhase: AbilityPhase.Windup },
    { id: 'punch',    start: 0.15, end: 0.55, abilityPhase: AbilityPhase.Active,
      castBehaviours: [{ timingStart: 'start', timingEnd: 'end', targetIndex: 0, behaviour: punchBehaviour }] },
    { id: 'cooldown', start: 0.55, end: 1.40, abilityPhase: AbilityPhase.Cooldown },
];

const SNEAKY_PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="snFistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1a0f"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#snFistBg)" stroke="#4ade80" stroke-width="3"/>
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#d1fae5" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#d1fae5" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#d1fae5" stroke="#111827" stroke-width="1.5"/>
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#a7f3d0" stroke="#111827" stroke-width="1.5"/>
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#d1fae5" stroke="#111827" stroke-width="1.8"/>
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>
  <!-- Subtle diagonal rays suggesting stealth strike -->
  <path d="M14 18 L20 22" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 12 L32 18" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <!-- Small droplet accent (bleed/vulnerability) -->
  <ellipse cx="47" cy="40" rx="3" ry="4" fill="#4ade80" opacity="0.8"/>
  <path d="M47 36 L47 39" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

export const SneakyPunchAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Sneaky Punch',
    image: SNEAKY_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    tags: [],
    prefireTime: 0.15,
    targets: [TARGET_DEF],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: MAX_RANGE + DEFAULT_UNIT_RADIUS },

    getTooltipText(): string[] {
        return [
            `Hit {1} enemy for {${BASE_DAMAGE}} damage`,
            `+{${BONUS_DAMAGE}} bonus damage vs stunned or {bleeding} enemies`,
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < 0.55) {
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

export const SneakyPunchCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Sneaky Punch',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
