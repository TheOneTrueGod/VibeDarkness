/**
 * Bash - Warrior melee ability.
 *
 * Targets a point within range 50 + caster size (distance capped if farther).
 * Thick-line hitbox from caster to capped point; hits the closest enemy in the line.
 * Wind up 0.2s (no move), then plays a bash effect travelling along the full line
 * and deals damage to the closest enemy in the line (if any).
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { Unit } from '../../objects/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { areEnemies } from '../../engine/teams';
import { clampToMaxRange } from '../../abilities/previewHelpers';
import type { EventBus } from '../../engine/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';
import { canAttackBeBlocked, getBlockingArcForUnit, executeBlock } from '../../abilities/blockingHelpers';
import { ThickLineHitbox } from '../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}02`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 30;
const DAMAGE = 8;
const BASH_EFFECT_DURATION = 0.2;
/** Line thickness for hitbox and preview (px). Enemies within (unit.radius + this) of the line are hit. */
const LINE_THICKNESS = 20;

/** Minimum cast range (caster cannot target closer than this). */
function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

/** Maximum cast range (caster cannot target farther than this). Target point is capped to this. */
function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

interface GameEngineLike {
    units: Unit[];
    getUnit(id: string): Unit | undefined;
    addEffect(effect: Effect): void;
    gameTime: number;
    eventBus: EventBus;
}

const BASH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
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

export const BashAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Bash',
    image: BASH_IMAGE,
    cooldownTime: 1.6,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: 0.2, abilityPhase: AbilityPhase.Windup },
        { duration: 0.1, abilityPhase: AbilityPhase.Active },
        { duration: 1.3, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getDescription(_gameState?: unknown): string {
        return `Melee attack. Wind up 0.2s (cannot move). Aim at a point; hits the closest enemy in a thick line. Deal ${DAMAGE} damage and bash effect. Max range: 50 + your size.`;
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

        const targetDef = targets[0];
        if (!targetDef || targetDef.type !== 'pixel' || !targetDef.position) return;

        const eng = engine as GameEngineLike;
        const maxR = getMaxRange(caster);
        const { endX, endY } = clampToMaxRange(caster, targetDef.position, maxR);

        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng,
            caster,
            caster.x,
            caster.y,
            endX,
            endY,
            LINE_THICKNESS,
        );

        // Effect travels along the full ability line (caster edge to capped target point)
        const lineDx = endX - caster.x;
        const lineDy = endY - caster.y;
        const lineDist = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
        const dX = lineDist > 0 ? lineDx / lineDist : 1;
        const dY = lineDist > 0 ? lineDy / lineDist : 0;
        const effectStartX = caster.x + dX * (caster.radius * 0.5);
        const effectStartY = caster.y + dY * (caster.radius * 0.5);

        const bashEffect = new Effect({
            x: endX,
            y: endY,
            duration: BASH_EFFECT_DURATION,
            effectType: 'bash',
            startX: effectStartX,
            startY: effectStartY,
        });
        eng.addEffect(bashEffect);

        if (hitUnits.length === 0) return;

        // Closest enemy to caster (in the thick line) is the one we hit
        const casterX = caster.x;
        const casterY = caster.y;
        hitUnits.sort((a, b) => {
            const da = (a.x - casterX) ** 2 + (a.y - casterY) ** 2;
            const db = (b.x - casterX) ** 2 + (b.y - casterY) ** 2;
            return da - db;
        });
        const targetUnit = hitUnits[0];
        if (!targetUnit.isAlive() || targetUnit.hasIFrames(eng.gameTime)) return;

        if (canAttackBeBlocked(targetUnit, caster.x, caster.y, eng.gameTime)) {
            const block = getBlockingArcForUnit(targetUnit, eng.gameTime);
            if (block) {
                executeBlock(eng, targetUnit, { type: 'melee', sourceUnitId: caster.id }, CARD_ID, block);
                return;
            }
        }
        targetUnit.takeDamage(DAMAGE, caster.id, eng.eventBus);
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        ThickLineHitbox.renderPreview(ctx, caster, mouseWorld, getMaxRange(caster), LINE_THICKNESS);
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
        ThickLineHitbox.renderTargetingPreview(gr, caster, mouseWorld, getMaxRange(caster), LINE_THICKNESS);
    },
};

export const BashCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Bash',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
