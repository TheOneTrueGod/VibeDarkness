/**
 * Punch - Warrior melee ability.
 *
 * Targets a point within range 50 + caster size (distance capped if farther).
 * Thick-line hitbox from caster to capped point; hits the closest enemy in the line.
 * Wind up 0.2s (no move), then plays a punch effect travelling along the full line
 * and deals damage to the closest enemy in the line (if any).
 */

import { AbilityEventType, AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import type { ActiveAbility } from '../../game/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import type { EventBus } from '../../game/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition, getAimPointClampedToMaxRange, getDirectionFromTo } from '../../abilities/targetHelpers';
import { ThickLineHitbox } from '../../hitboxes';
import { getTrainingPunchResearchState, type TrainingPunchResearchState } from '../../research/researchTrainingEffects';
import { DescriptiveValue, getApproxIntegerIncrease } from '../../../../researchTrees/descriptiveValue';
import { STUNNED_BUFF_TYPE } from '../../buffs/StunnedBuff';
import { TRAINING_NODE_CHARGING_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_TREE_ID } from '../../../../researchTrees/trees/training';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}02`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 30;
const BASE_DAMAGE = 8;
const STRONG_PUNCH_BONUS_DAMAGE = getApproxIntegerIncrease(BASE_DAMAGE, DescriptiveValue.Small);
const SNEAKY_PUNCH_BONUS_DAMAGE = getApproxIntegerIncrease(BASE_DAMAGE, DescriptiveValue.Medium);
const PUNCH_EFFECT_DURATION = 0.2;
/** Line thickness for hitbox and preview (px). Enemies within (unit.radius + this) of the line are hit. */
const LINE_THICKNESS = 20;
const POISE_DAMAGE = 1;
const KNOCKBACK_MAGNITUDE = 12;
const KNOCKBACK_AIR_TIME = 0.03;
const KNOCKBACK_SLIDE_TIME = 0.06;
const STRONG_PUNCH_STUN_DURATION = 1.2;
const DOUBLE_PUNCH_SECOND_STRIKE_TIME = 0.42;
const MOVEMENT_LOCK_BASE_END = 0.2;
const MOVEMENT_LOCK_DOUBLE_END = 0.42;
const ONE_TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Target point' }];
const TWO_TARGETS: TargetDef[] = [
    { type: 'pixel', label: 'First target point' },
    { type: 'pixel', label: 'Second target point' },
];
const BASE_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
    { id: 'hit', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active },
    { id: 'cooldown', start: 0.3, end: 1.6, abilityPhase: AbilityPhase.Cooldown },
];
const DOUBLE_PUNCH_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
    { id: 'hit1', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active },
    { id: 'reset', start: 0.3, end: DOUBLE_PUNCH_SECOND_STRIKE_TIME, abilityPhase: AbilityPhase.Windup },
    { id: 'hit2', start: DOUBLE_PUNCH_SECOND_STRIKE_TIME, end: 0.52, abilityPhase: AbilityPhase.Active },
    { id: 'cooldown', start: 0.52, end: 1.9, abilityPhase: AbilityPhase.Cooldown },
];

/** Minimum cast range (caster cannot target closer than this). */
function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

/** Maximum cast range (caster cannot target farther than this). Punch always fires at this distance. */
function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

interface GameEngineLike {
    units: Unit[];
    localPlayerId?: string;
    getUnit(id: string): Unit | undefined;
    addEffect(effect: Effect): void;
    gameTime: number;
    roundNumber: number;
    eventBus: EventBus;
    generateRandomInteger(min: number, max: number): number;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    interruptUnitAndRefundAbilities?(unit: Unit): void;
}

interface PunchPlan {
    targets: TargetDef[];
    abilityTimings: AbilityTimingInterval[];
    movementLockUntil: number;
    strikeTimes: { time: number; targetIndex: number }[];
    research: TrainingPunchResearchState;
}

type PunchCastPayload = {
    movementLockUntil: number;
};

function buildPunchPlan(research: TrainingPunchResearchState): PunchPlan {
    if (research.hasDoublePunch) {
        return {
            targets: TWO_TARGETS,
            abilityTimings: DOUBLE_PUNCH_TIMINGS,
            movementLockUntil: MOVEMENT_LOCK_DOUBLE_END,
            strikeTimes: [
                { time: 0.2, targetIndex: 0 },
                { time: DOUBLE_PUNCH_SECOND_STRIKE_TIME, targetIndex: 1 },
            ],
            research,
        };
    }
    return {
        targets: ONE_TARGETS,
        abilityTimings: BASE_TIMINGS,
        movementLockUntil: MOVEMENT_LOCK_BASE_END,
        strikeTimes: [{ time: 0.2, targetIndex: 0 }],
        research,
    };
}

function getOwnerPunchResearch(engine: GameEngineLike | undefined, caster?: Unit): TrainingPunchResearchState {
    if (!engine) {
        return {
            hasDoublePunch: false,
            hasStrongPunch: false,
            hasSneakyPunch: false,
            hasChargingPunch: false,
        };
    }
    const ownerId = caster?.ownerId ?? engine.localPlayerId;
    if (!ownerId || !engine.getPlayerResearchNodes) {
        return {
            hasDoublePunch: false,
            hasStrongPunch: false,
            hasSneakyPunch: false,
            hasChargingPunch: false,
        };
    }
    return getTrainingPunchResearchState((treeId: string) => engine.getPlayerResearchNodes?.(ownerId, treeId) ?? []);
}

function getPunchBaseDamageForTarget(research: TrainingPunchResearchState, target: Unit | undefined): number {
    let damage = BASE_DAMAGE;
    if (research.hasStrongPunch) {
        damage += STRONG_PUNCH_BONUS_DAMAGE;
    }
    if (research.hasSneakyPunch && target?.hasBuff(STUNNED_BUFF_TYPE)) {
        damage += SNEAKY_PUNCH_BONUS_DAMAGE;
    }
    return damage;
}

function tryStrikeTarget(engine: GameEngineLike, caster: Unit, plan: PunchPlan, targetIndex: number, targets: ResolvedTarget[]): void {
    const targetPos = getPixelTargetPosition(targets, targetIndex);
    if (!targetPos) return;

    const maxR = getMaxRange(caster);
    const { x: endX, y: endY } = getAimPointClampedToMaxRange(caster, targetPos, maxR);
    const hitUnits = ThickLineHitbox.getUnitsInHitbox(
        engine,
        caster,
        caster.x,
        caster.y,
        endX,
        endY,
        LINE_THICKNESS,
    );

    const { dirX: dX, dirY: dY } = getDirectionFromTo(caster.x, caster.y, endX, endY);
    const effectStartX = caster.x + dX * (caster.radius * 0.5);
    const effectStartY = caster.y + dY * (caster.radius * 0.5);
    engine.addEffect(
        new Effect({
            x: endX,
            y: endY,
            duration: PUNCH_EFFECT_DURATION,
            effectType: 'punch',
            startX: effectStartX,
            startY: effectStartY,
        }),
    );

    if (hitUnits.length === 0) return;
    hitUnits.sort((a, b) => {
        const da = (a.x - caster.x) ** 2 + (a.y - caster.y) ** 2;
        const db = (b.x - caster.x) ** 2 + (b.y - caster.y) ** 2;
        return da - db;
    });

    const targetUnit = hitUnits[0]!;
    if (!targetUnit.isAlive() || targetUnit.hasIFrames(engine.gameTime)) return;

    const baseDamage = getPunchBaseDamageForTarget(plan.research, targetUnit);
    const didDamage = tryDamageOrBlock(targetUnit, {
        engine,
        gameTime: engine.gameTime,
        eventBus: engine.eventBus,
        attackerX: caster.x,
        attackerY: caster.y,
        attackerId: caster.id,
        abilityId: CARD_ID,
        // `tryDamageOrBlock` applies standard ability damage modifiers once.
        damage: baseDamage,
        attackType: 'melee',
    });
    if (!didDamage) return;

}

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

export const PunchAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Punch',
    image: PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    abilityTimings: BASE_TIMINGS,
    getAbilityTimings(caster, gameState) {
        const engine = gameState as GameEngineLike | undefined;
        const research = getOwnerPunchResearch(engine, caster);
        return buildPunchPlan(research).abilityTimings;
    },
    targets: ONE_TARGETS,
    getTargets(caster?: Unit, gameState?: unknown): TargetDef[] {
        const engine = gameState as GameEngineLike | undefined;
        return buildPunchPlan(getOwnerPunchResearch(engine, caster)).targets;
    },
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },
    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                id: 'punch_strong_cc',
                conditions: [
                    { type: 'hitResultIs', result: 'hit' },
                    { type: 'casterHasResearchNode', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                ],
                effects: [
                    {
                        type: 'applyKnockbackToPrimaryTarget',
                        poiseDamage: POISE_DAMAGE,
                        magnitude: KNOCKBACK_MAGNITUDE,
                        airTime: KNOCKBACK_AIR_TIME,
                        slideTime: KNOCKBACK_SLIDE_TIME,
                        sourceAbilityId: CARD_ID,
                    },
                    { type: 'applyStunnedToPrimaryTarget', duration: STRONG_PUNCH_STUN_DURATION },
                    { type: 'interruptPrimaryTargetAbilities' },
                ],
            },
            {
                id: 'punch_charging_recover',
                conditions: [
                    { type: 'hitResultIs', result: 'hit' },
                    { type: 'casterHasResearchNode', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
                ],
                effects: [
                    { type: 'recoverCharge', chargeType: 'lightCharge', amount: 1, recipient: 'randomAbility' },
                ],
            },
        ],
    },

    getTooltipText(gameState?: unknown): string[] {
        const engine = gameState as GameEngineLike | undefined;
        const research = getOwnerPunchResearch(engine);
        const lines: string[] = [];
        if (research.hasDoublePunch) {
            lines.push(`Hit {2} enemies in sequence for {${BASE_DAMAGE}} damage each`);
        } else {
            lines.push(`Hit {1} enemy for {${BASE_DAMAGE}} damage`);
        }
        if (research.hasStrongPunch) {
            lines.push(`Strong Punch: +{${STRONG_PUNCH_BONUS_DAMAGE}} damage, knockback, and stun`);
        }
        if (research.hasSneakyPunch) {
            lines.push(`Sneaky Punch: +{${SNEAKY_PUNCH_BONUS_DAMAGE}} damage vs stunned enemies`);
        }
        if (research.hasChargingPunch) {
            lines.push('Charging Punch: On hit, grant {1} Light Charge');
        }
        return lines;
    },

    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: getMinRange(caster), maxRange: getMaxRange(caster) };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < MOVEMENT_LOCK_BASE_END) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },
    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as GameEngineLike;
        const plan = buildPunchPlan(getOwnerPunchResearch(eng, caster));
        const payload: PunchCastPayload = { movementLockUntil: plan.movementLockUntil };
        active.castPayload = payload;
    },
    getAbilityStatesForActive(currentTime: number, active: ActiveAbility): AbilityStateEntry[] {
        const payload = active.castPayload as PunchCastPayload | undefined;
        const movementLockUntil = payload?.movementLockUntil ?? MOVEMENT_LOCK_BASE_END;
        if (currentTime < movementLockUntil) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const pos = getPixelTargetPosition(targets, 0);
        const eng = engine as GameEngineLike;
        const plan = buildPunchPlan(getOwnerPunchResearch(eng, caster));

        // Preserve baseline behavior: no hit if first target is missing.
        if (!pos) return;
        for (const strike of plan.strikeTimes) {
            if (prevTime < strike.time && currentTime >= strike.time) {
                tryStrikeTarget(eng, caster, plan, strike.targetIndex, targets);
            }
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Melee blocked: no additional behaviour.
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): void {
        const maxR = getMaxRange(caster);
        const aimAtMax = getAimPointClampedToMaxRange(caster, mouseWorld, maxR);
        ThickLineHitbox.renderTargetingPreview(gr, caster, aimAtMax, maxR, LINE_THICKNESS);
    },
};

export const PunchCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Punch',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
