/**
 * Swing Sword — Warrior melee (crafted sword).
 *
 * Like Laser Sword: thick perpendicular slash, up to 2 targets (3 with research), wide line,
 * metallic gray trail. Slightly shorter reach than Laser Sword; much lower knockback than Swing Bat.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../types';
import { createSlashTrailEffect } from '../../abilities/effectHelpers';
import type { Effect } from '../../game/effects/Effect';
import type { EventBus } from '../../game/EventBus';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { ThickLineHitbox } from '../../hitboxes';
import {
    STICK_SWORD_TREE_ID,
    STICK_SWORD_NODE_EXTRA_TARGET,
} from '../../../../researchTrees/trees/stick_sword';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}12`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
/** Slightly closer reach than Laser Sword (56). */
const BASE_MAX_RANGE = 48;
const DAMAGE = 10;
const SLASH_TRAIL_DURATION = 0.35;
const SLASH_TRAIL_THICKNESS = 14;
const SLASH_TRAIL_COLOR = 0xc0c8d0;
const POISE_DAMAGE = 20;
/** Much lower than Swing Bat / Laser Sword (80). */
const KNOCKBACK_MAGNITUDE = 32;
const KNOCKBACK_AIR_TIME = 0.3;
const KNOCKBACK_SLIDE_TIME = 0.2;
const BASE_MAX_TARGETS = 2;
const WITH_RESEARCH_MAX_TARGETS = 3;
/** Line thickness for hitbox and preview (px) — same family as Laser Sword. */
const LINE_THICKNESS = 36;
const SWING_LENGTH = 80;

function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

function getPerpendicularLine(
    caster: { x: number; y: number },
    target: { x: number; y: number },
    minRange: number,
    maxRange: number,
): {
    leftX: number;
    leftY: number;
    rightX: number;
    rightY: number;
    centerX: number;
    centerY: number;
    aimDirX: number;
    aimDirY: number;
} {
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const aimDirX = dist > 0 ? dx / dist : 1;
    const aimDirY = dist > 0 ? dy / dist : 0;
    const clampedDist = Math.max(minRange, Math.min(maxRange, dist || maxRange));
    const centerX = caster.x + aimDirX * clampedDist;
    const centerY = caster.y + aimDirY * clampedDist;
    const half = SWING_LENGTH / 2;
    const perpX = -aimDirY * half;
    const perpY = aimDirX * half;
    return {
        leftX: centerX - perpX,
        leftY: centerY - perpY,
        rightX: centerX + perpX,
        rightY: centerY + perpY,
        centerX,
        centerY,
        aimDirX,
        aimDirY,
    };
}

interface GameEngineLike {
    units: Unit[];
    getUnit(id: string): Unit | undefined;
    addEffect(effect: Effect): void;
    gameTime: number;
    eventBus: EventBus;
    interruptUnitAndRefundAbilities(unit: Unit): void;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    localPlayerId?: string;
}

function getMaxTargets(engine: GameEngineLike | undefined, caster: Unit): number {
    const nodes = engine?.getPlayerResearchNodes?.(caster.ownerId, STICK_SWORD_TREE_ID) ?? [];
    return nodes.includes(STICK_SWORD_NODE_EXTRA_TARGET) ? WITH_RESEARCH_MAX_TARGETS : BASE_MAX_TARGETS;
}

function getMaxTargetsForTooltip(engine: GameEngineLike | undefined): number {
    const ownerId = engine?.localPlayerId ?? '';
    const nodes = engine?.getPlayerResearchNodes?.(ownerId, STICK_SWORD_TREE_ID) ?? [];
    return nodes.includes(STICK_SWORD_NODE_EXTRA_TARGET) ? WITH_RESEARCH_MAX_TARGETS : BASE_MAX_TARGETS;
}

const SWING_SWORD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="swblade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9ca3af"/><stop offset="0.5" stop-color="#d1d5db"/><stop offset="1" stop-color="#e5e7eb"/></linearGradient></defs>
  <rect x="26" y="14" width="12" height="36" rx="2" fill="url(#swblade)" stroke="#6b7280" stroke-width="1"/>
  <rect x="28" y="8" width="8" height="8" rx="2" fill="#52525b" stroke="#3f3f46"/>
  <ellipse cx="32" cy="32" rx="5" ry="5" fill="#d1d5db" opacity="0.5"/>
</svg>`;

export const SwingSwordAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Swing Sword',
    image: SWING_SWORD_IMAGE,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
        { id: 'slash', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: 0.3, end: 1.6, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getTooltipText(gameState?: unknown): string[] {
        const engine = gameState as GameEngineLike | undefined;
        const maxT = getMaxTargetsForTooltip(engine);
        return [
            `Slash with the sword dealing {${DAMAGE}} damage to up to ${maxT} enemies, interrupting and knocking them back.`,
        ];
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
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);
        const line = getPerpendicularLine(caster, pos, minR, maxR);
        const maxTargets = getMaxTargets(eng, caster);

        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng,
            caster,
            line.leftX,
            line.leftY,
            line.rightX,
            line.rightY,
            LINE_THICKNESS,
        );

        eng.addEffect(
            createSlashTrailEffect(
                line.leftX,
                line.leftY,
                line.rightX,
                line.rightY,
                SLASH_TRAIL_DURATION,
                SLASH_TRAIL_THICKNESS,
                SLASH_TRAIL_COLOR,
            ),
        );

        if (hitUnits.length === 0) return;

        hitUnits.sort((a, b) => {
            const da = (a.x - line.leftX) ** 2 + (a.y - line.leftY) ** 2;
            const db = (b.x - line.leftX) ** 2 + (b.y - line.leftY) ** 2;
            return da - db;
        });

        const targetsToHit = hitUnits.slice(0, maxTargets);
        for (const targetUnit of targetsToHit) {
            if (!targetUnit.isAlive() || targetUnit.hasIFrames(eng.gameTime)) continue;

            const blocked = !tryDamageOrBlock(targetUnit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: CARD_ID,
                damage: DAMAGE,
                attackType: 'melee',
            });
            if (blocked) continue;

            const { dirX: tX, dirY: tY } = getDirectionFromTo(caster.x, caster.y, targetUnit.x, targetUnit.y);
            targetUnit.applyKnockback(
                POISE_DAMAGE,
                {
                    knockbackVector: { x: tX * KNOCKBACK_MAGNITUDE, y: tY * KNOCKBACK_MAGNITUDE },
                    knockbackAirTime: KNOCKBACK_AIR_TIME,
                    knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                    knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
                },
                eng.eventBus,
                (u) => eng.interruptUnitAndRefundAbilities(u),
            );
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): void {
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);
        const line = getPerpendicularLine(caster, mouseWorld, minR, maxR);
        const half = LINE_THICKNESS / 2;
        const offX = line.aimDirX * half;
        const offY = line.aimDirY * half;

        const leftTopX = line.leftX + offX;
        const leftTopY = line.leftY + offY;
        const leftBotX = line.leftX - offX;
        const leftBotY = line.leftY - offY;
        const rightBotX = line.rightX - offX;
        const rightBotY = line.rightY - offY;
        const rightTopX = line.rightX + offX;
        const rightTopY = line.rightY + offY;
        const midX = line.centerX;
        const midY = line.centerY;

        gr.clear();
        gr.moveTo(leftTopX, leftTopY);
        gr.lineTo(leftBotX, leftBotY);
        gr.lineTo(midX - offX, midY - offY);
        gr.lineTo(midX + offX, midY + offY);
        gr.lineTo(leftTopX, leftTopY);
        gr.fill({ color: 0x78716c, alpha: 0.5 });
        gr.moveTo(midX + offX, midY + offY);
        gr.lineTo(midX - offX, midY - offY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(midX + offX, midY + offY);
        gr.fill({ color: 0xd1d5db, alpha: 0.55 });
        gr.moveTo(leftTopX, leftTopY);
        gr.lineTo(leftBotX, leftBotY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(leftTopX, leftTopY);
        gr.stroke({ color: 0x9ca3af, width: 2, alpha: 0.95 });
    },
};

export const SwingSwordCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Swing Sword',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
