/**
 * Punch - Warrior melee ability.
 *
 * Targets a point within range 50 + caster size (distance capped if farther).
 * Thick-line hitbox from caster to capped point; hits the closest enemy in the line.
 * Wind up 0.2s (no move), then plays a punch effect travelling along the full line
 * and deals damage to the closest enemy in the line (if any).
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import type { EventBus } from '../../game/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition, getAimPointClampedToMaxRange, getDirectionFromTo } from '../../abilities/targetHelpers';
import { ThickLineHitbox } from '../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}02`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 30;
const BASE_DAMAGE = 8;
const CORE_TRAINING_DAMAGE_BONUS = 2;
const PUNCH_EFFECT_DURATION = 0.2;
/** Line thickness for hitbox and preview (px). Enemies within (unit.radius + this) of the line are hit. */
const LINE_THICKNESS = 20;

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
    eventBus: EventBus;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
}

function getPunchDamage(engine: GameEngineLike, caster: Unit): number {
    const nodes = engine.getPlayerResearchNodes?.(caster.ownerId, 'training') ?? [];
    const hasCoreTraining = nodes.includes('core_training');
    return BASE_DAMAGE + (hasCoreTraining ? CORE_TRAINING_DAMAGE_BONUS : 0);
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
    abilityTimings: [
        { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
        { id: 'hit', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: 0.3, end: 1.6, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getTooltipText(gameState?: unknown): string[] {
        const eng = gameState as GameEngineLike | undefined;
        const playerUnit = eng?.localPlayerId
            ? eng.units?.find((u) => u.ownerId === eng.localPlayerId)
            : undefined;
        const damage = eng && playerUnit ? getPunchDamage(eng, playerUnit) : BASE_DAMAGE;
        return [`Hit {1} enemy for {${damage}} damage`];
    },

    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: getMinRange(caster), maxRange: getMaxRange(caster) };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < PREFIRE_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= PREFIRE_TIME || currentTime < PREFIRE_TIME) return;

        const pos = getPixelTargetPosition(targets, 0);
        if (!pos) return;

        const eng = engine as GameEngineLike;
        const maxR = getMaxRange(caster);
        const { x: endX, y: endY } = getAimPointClampedToMaxRange(caster, pos, maxR);

        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng,
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
        const punchEffect = new Effect({
            x: endX,
            y: endY,
            duration: PUNCH_EFFECT_DURATION,
            effectType: 'punch',
            startX: effectStartX,
            startY: effectStartY,
        });
        eng.addEffect(punchEffect);

        if (hitUnits.length === 0) return;

        hitUnits.sort((a, b) => {
            const da = (a.x - caster.x) ** 2 + (a.y - caster.y) ** 2;
            const db = (b.x - caster.x) ** 2 + (b.y - caster.y) ** 2;
            return da - db;
        });
        const targetUnit = hitUnits[0]!;
        if (!targetUnit.isAlive() || targetUnit.hasIFrames(eng.gameTime)) return;

        tryDamageOrBlock(targetUnit, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId: CARD_ID,
            damage: getPunchDamage(eng, caster),
            attackType: 'melee',
        });
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
