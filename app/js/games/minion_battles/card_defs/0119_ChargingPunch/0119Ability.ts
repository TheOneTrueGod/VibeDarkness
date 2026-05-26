/**
 * Charging Punch - Warrior melee ability.
 *
 * On hit: grants 1 Light Charge to a random ability.
 * Exclusive upgrade to Punch via the Training research tree.
 */

import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityEventType, AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { HitboxDef } from '../../abilities/hitboxDef';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { ThickLineHitbox } from '../../hitboxes';
import { getAimPointClampedToMaxRange } from '../../abilities/targetHelpers';
import { buildHitboxContext, renderMeleeTrackingHighlights } from '../../abilities/meleeTrackingHelpers';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}19`;
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
    { id: 'punch',    start: 0.15, end: 0.55, abilityPhase: AbilityPhase.Active,
      castBehaviours: [{ timingStart: 'start', timingEnd: 'end', targetIndex: 0, behaviour: punchBehaviour }] },
    { id: 'cooldown', start: 0.55, end: 1.40, abilityPhase: AbilityPhase.Cooldown },
];

const CHARGING_PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="chFistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a00"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#chFistBg)" stroke="#facc15" stroke-width="3"/>
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#fef9c3" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#fef9c3" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#fef9c3" stroke="#111827" stroke-width="1.5"/>
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#fde68a" stroke="#111827" stroke-width="1.5"/>
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#fef9c3" stroke="#111827" stroke-width="1.8"/>
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>
  <!-- Lightning bolt accent -->
  <path d="M36 11 L30 20 L34 20 L28 30" stroke="#facc15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <!-- Energy rays -->
  <path d="M14 18 L20 22" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 32 L16 32" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M52 32 L46 32" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const ChargingPunchAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Charging Punch',
    image: CHARGING_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    tags: [],
    prefireTime: 0.15,
    targets: [TARGET_DEF],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: MAX_RANGE + DEFAULT_UNIT_RADIUS },

    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                id: 'charging_punch_charge',
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [
                    { type: 'recoverCharge', chargeType: 'lightCharge', amount: 1, recipient: 'randomAbility' },
                ],
            },
        ],
    },

    getTooltipText(): string[] {
        return [
            `Hit {1} enemy for {${PUNCH_DAMAGE}} damage`,
            'On hit: grant {1} Light Charge to a random ability',
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

export const ChargingPunchCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Charging Punch',
    abilityId: CARD_ID,
    discardDuration: { duration: 1, unit: 'rounds' },
};
