/**
 * Swing Bat - Warrior melee ability.
 *
 * Similar to Bash: targets a point (capped to range), thick-line hitbox,
 * hits closest enemy. Deals more damage than Bash and applies knockback (poise check).
 * 20% longer range than original (72 + caster size). Line thickness 26.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { Unit } from '../../objects/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { clampToMaxRange } from '../../abilities/previewHelpers';
import type { EventBus } from '../../engine/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';
import { canAttackBeBlocked, getBlockingArcForUnit, executeBlock } from '../../abilities/blockingHelpers';
import { ThickLineHitbox } from '../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}03`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 72; // 60 * 1.2 (20% longer)
const DAMAGE = 10;
const SWING_BAT_EFFECT_DURATION = 0.4;
const POISE_DAMAGE = 10;
const KNOCKBACK_MAGNITUDE = 80;
const KNOCKBACK_AIR_TIME = 0.3;
const KNOCKBACK_SLIDE_TIME = 0.2;
/** Line thickness for hitbox and preview (px). */
const LINE_THICKNESS = 26;

function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

interface GameEngineLike {
    units: Unit[];
    getUnit(id: string): Unit | undefined;
    addEffect(effect: Effect): void;
    gameTime: number;
    eventBus: EventBus;
    interruptUnitAndRefundAbilities(unit: Unit): void;
}

const SWING_BAT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="24" width="48" height="16" rx="4" fill="#8B4513" stroke="#654321" stroke-width="2"/>
  <ellipse cx="32" cy="32" rx="14" ry="14" fill="#d4a574" stroke="#8B4513" stroke-width="2"/>
  <path d="M32 18 L35 24 L32 30 L29 24 Z M32 34 L35 40 L32 46 L29 40 Z" fill="#8B0000"/>
</svg>`;

export const SwingBatAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Swing Bat',
    image: SWING_BAT_IMAGE,
    cooldownTime: 2.1,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getDescription(_gameState?: unknown): string {
        return `Melee attack. Wind up 0.2s (cannot move). Aim at a point; hits closest enemy in a thick line. Deal ${DAMAGE} damage and attempt knockback (poise check). Max range: ${BASE_MAX_RANGE} + your size.`;
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

        if (hitUnits.length === 0) return;

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

        const dist = Math.sqrt(
            (targetUnit.x - caster.x) ** 2 + (targetUnit.y - caster.y) ** 2,
        );
        const dx = targetUnit.x - caster.x;
        const dy = targetUnit.y - caster.y;
        const dX = dist > 0 ? dx / dist : 1;
        const dY = dist > 0 ? dy / dist : 0;

        targetUnit.applyKnockback(
            POISE_DAMAGE,
            {
                knockbackVector: { x: dX * KNOCKBACK_MAGNITUDE, y: dY * KNOCKBACK_MAGNITUDE },
                knockbackAirTime: KNOCKBACK_AIR_TIME,
                knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
            },
            eng.eventBus,
            (u) => eng.interruptUnitAndRefundAbilities(u),
        );

        const startX = caster.x + dX * (caster.radius * 0.5);
        const startY = caster.y + dY * (caster.radius * 0.5);
        const effectEndX = targetUnit.x - dX * (targetUnit.radius * 0.5);
        const effectEndY = targetUnit.y - dY * (targetUnit.radius * 0.5);

        const effect = new Effect({
            x: effectEndX,
            y: effectEndY,
            duration: SWING_BAT_EFFECT_DURATION,
            effectType: 'bash',
            startX,
            startY,
        });
        eng.addEffect(effect);
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

export const SwingBatCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Swing Bat',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
