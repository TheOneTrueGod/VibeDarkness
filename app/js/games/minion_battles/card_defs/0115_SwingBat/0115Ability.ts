/**
 * Swing Bat — Warrior melee (pipe bat).
 *
 * Heavy perpendicular swing. Hits up to 3 targets; longer stun/knockback than the basic stick.
 * Damage boosted by Reinforced Steel research.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { EventBus } from '../../game/EventBus';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { ThickLineHitbox } from '../../hitboxes';
import { isSinglePlayerBattle } from '../../abilities/singlePlayerBattle';
import {
    createChargeUpConfig,
    getMeleeAnimationOffset,
    spawnMeleeChargeUpEffect,
    type MeleeAnimationProfile,
} from '../../abilities/meleeAnimationProfile';
import {
    buildHitboxContext,
    buildMeleeTrackingEntries,
    getMeleeTrackingAimPoint,
    renderMeleeTrackingHighlights,
    updateMeleeTrackingEntry,
    type MeleeTrackingEntry,
} from '../../abilities/meleeTrackingHelpers';
import {
    STICK_SWORD_TREE_ID,
    STICK_SWORD_NODE_PIPE_BAT_DAMAGE,
} from '../../../../researchTrees/trees/stick_sword';
import { getApproxIntegerIncrease, DescriptiveValue } from '../../../../researchTrees/descriptiveValue';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}15`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 56;
const BASE_DAMAGE = 10;
const DAMAGE_RESEARCH_BONUS = getApproxIntegerIncrease(BASE_DAMAGE, DescriptiveValue.Medium);
const SWING_BAT_EFFECT_DURATION = 0.4;
const POISE_DAMAGE = 10;
const KNOCKBACK_MAGNITUDE = 45;
/** Longer air/slide time than the basic stick for a heavier-feeling stun. */
const KNOCKBACK_AIR_TIME = 0.5;
const KNOCKBACK_SLIDE_TIME = 0.3;
const MAX_TARGETS = 3;
const LINE_THICKNESS = 26;
const SWING_LENGTH = 80;
const SWING_BAT_MELEE_ANIMATION: MeleeAnimationProfile = {
    slide: {
        startTime: 0.1,
        impactTime: 0.2,
        backstepEndTime: 0.3,
        forwardDistance: 18,
        backwardDistance: 0,
    },
    chargeUp: createChargeUpConfig('high', {
        startTime: 0.04,
        endTime: 0.1,
        radius: DEFAULT_UNIT_RADIUS,
        color: 0x8a6a3a,
    }),
};

type SwingBatCastPayload = {
    meleeAnimationProfile: MeleeAnimationProfile;
    meleeTracking: MeleeTrackingEntry[];
};

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
}

function getDamage(engine: GameEngineLike | undefined, caster: Unit): number {
    const nodes = engine?.getPlayerResearchNodes?.(caster.ownerId, STICK_SWORD_TREE_ID) ?? [];
    return nodes.includes(STICK_SWORD_NODE_PIPE_BAT_DAMAGE)
        ? BASE_DAMAGE + DAMAGE_RESEARCH_BONUS
        : BASE_DAMAGE;
}

const SWING_BAT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="28" width="44" height="12" rx="3" fill="#6b6b7a" stroke="#4a4a58" stroke-width="2"/>
  <rect x="28" y="8" width="8" height="24" rx="2" fill="#7c7c8c" stroke="#4a4a58" stroke-width="1.5"/>
  <rect x="10" y="28" width="20" height="12" rx="3" fill="#5a5a68" opacity="0.6"/>
  <circle cx="52" cy="34" r="5" fill="#4a4a58" stroke="#333344" stroke-width="1.5"/>
</svg>`;

export const SwingBatAbility_0115: AbilityStatic = {
    id: CARD_ID,
    name: 'Swing Bat',
    image: SWING_BAT_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    tags: ['meleeTracking'],
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
        { id: 'hit', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: 0.3, end: 1.65, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            `Swing your pipe bat dealing {${BASE_DAMAGE}} damage to up to ${MAX_TARGETS} enemies, interrupting and knocking them back hard.`,
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

    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as GameEngineLike;
        const meleeAnimationProfile: MeleeAnimationProfile = {
            ...SWING_BAT_MELEE_ANIMATION,
            chargeUp: SWING_BAT_MELEE_ANIMATION.chargeUp
                ? { ...SWING_BAT_MELEE_ANIMATION.chargeUp }
                : undefined,
        };
        if (meleeAnimationProfile.chargeUp) {
            meleeAnimationProfile.chargeUp = {
                ...meleeAnimationProfile.chargeUp,
                pulses: meleeAnimationProfile.chargeUp.pulses.map((pulse) => ({ ...pulse })),
            };
            for (const pulse of meleeAnimationProfile.chargeUp.pulses) {
                pulse.startRadius += caster.radius - DEFAULT_UNIT_RADIUS;
                pulse.endRadius += caster.radius - DEFAULT_UNIT_RADIUS;
            }
        }
        const pos = getPixelTargetPosition(targets, 0);
        let trackedUnits: (Unit | null)[] = [];
        if (pos) {
            const minR = getMinRange(caster);
            const maxR = getMaxRange(caster);
            const line = getPerpendicularLine(caster, pos, minR, maxR);
            const ctx = buildHitboxContext(eng.units);
            const hits = ThickLineHitbox.getUnitsInHitbox(ctx, caster, line.leftX, line.leftY, line.rightX, line.rightY, LINE_THICKNESS);
            hits.sort((a, b) => {
                const da = (a.x - line.leftX) ** 2 + (a.y - line.leftY) ** 2;
                const db = (b.x - line.leftX) ** 2 + (b.y - line.leftY) ** 2;
                return da - db;
            });
            trackedUnits = hits.slice(0, MAX_TARGETS).map((u) => u);
        }
        const payload: SwingBatCastPayload = {
            meleeAnimationProfile,
            meleeTracking: buildMeleeTrackingEntries(trackedUnits),
        };
        active.castPayload = payload;
        spawnMeleeChargeUpEffect(eng, caster, meleeAnimationProfile);
    },

    getCasterRenderOffset(caster: Unit, activeAbility: ActiveAbility, gameTime: number): { x: number; y: number } | null {
        const payload = activeAbility.castPayload as SwingBatCastPayload | undefined;
        if (!payload?.meleeAnimationProfile) return null;
        return getMeleeAnimationOffset(caster, activeAbility, gameTime, payload.meleeAnimationProfile);
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number, active?: ActiveAbility): void {
        const eng = engine as GameEngineLike;
        const payload = active?.castPayload as SwingBatCastPayload | undefined;
        const tracking = payload?.meleeTracking;
        const maxR = getMaxRange(caster);

        if (tracking) {
            for (const entry of tracking) {
                updateMeleeTrackingEntry(eng, caster, entry, maxR);
            }
        }

        if (prevTime >= PREFIRE_TIME || currentTime < PREFIRE_TIME) return;

        const fallbackPos = getPixelTargetPosition(targets, 0);
        if (!fallbackPos && !tracking?.length) return;

        const primaryEntry = tracking?.[0];
        const pos = primaryEntry && fallbackPos
            ? getMeleeTrackingAimPoint(eng, primaryEntry, fallbackPos)
            : (fallbackPos ?? null);

        if (pos) {
            const minR = getMinRange(caster);
            const line = getPerpendicularLine(caster, pos, minR, maxR);
            eng.addEffect(new Effect({
                x: line.rightX,
                y: line.rightY,
                duration: SWING_BAT_EFFECT_DURATION,
                effectType: 'punch',
                startX: line.leftX,
                startY: line.leftY,
            }));
        }

        if (!tracking || tracking.length === 0) return;

        const hitDamageBase = getDamage(eng, caster);

        for (const entry of tracking) {
            if (entry.lockedPosition !== null) continue;
            if (entry.unitId === null) continue;
            const targetUnit = eng.getUnit(entry.unitId);
            if (!targetUnit || !targetUnit.isAlive() || targetUnit.hasIFrames(eng.gameTime)) continue;

            let hitDamage = hitDamageBase;
            if (isSinglePlayerBattle(eng.units) && targetUnit.characterId === 'dark_wolf') {
                hitDamage = Math.max(hitDamage, targetUnit.maxHp);
            }

            const blocked = !tryDamageOrBlock(targetUnit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: CARD_ID,
                damage: hitDamage,
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
        units: Unit[],
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
        gr.fill({ color: 0x4a4a60, alpha: 0.55 });
        gr.moveTo(midX + offX, midY + offY);
        gr.lineTo(midX - offX, midY - offY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(midX + offX, midY + offY);
        gr.fill({ color: 0x8a8aa0, alpha: 0.7 });
        gr.moveTo(leftTopX, leftTopY);
        gr.lineTo(leftBotX, leftBotY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(leftTopX, leftTopY);
        gr.stroke({ color: 0x505060, width: 2, alpha: 0.9 });

        const ctx = buildHitboxContext(units);
        const hits = ThickLineHitbox.getUnitsInHitbox(ctx, caster, line.leftX, line.leftY, line.rightX, line.rightY, LINE_THICKNESS);
        if (hits.length > 0) {
            hits.sort((a, b) => {
                const da = (a.x - line.leftX) ** 2 + (a.y - line.leftY) ** 2;
                const db = (b.x - line.leftX) ** 2 + (b.y - line.leftY) ** 2;
                return da - db;
            });
            renderMeleeTrackingHighlights(gr, hits.slice(0, MAX_TARGETS));
        }
    },
};

export const SwingBatCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Swing Bat',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
