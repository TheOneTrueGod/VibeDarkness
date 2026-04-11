/**
 * Dodge - Warrior card. Move toward target up to 200px over 0.4s at constant rate.
 * Spawns afterimages every 2 ticks during the dodge.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../objects/Unit';
import { Effect } from '../../objects/Effect';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { drawCardForPlayer, applyForcedDisplacementToward } from '../../abilities/effectHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { getBodyColor, getCharacterSpriteKey } from '../../game/units/unit_defs/unitDef';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}01`;
const DODGE_DURATION = 0.4;
const DODGE_MAX_DISTANCE = 160;
/** Step size (px) when testing passability along the dodge path to avoid moving into terrain. */
const COLLISION_STEP = 4;

/** Duration of each afterimage in seconds (6 frames at 60 fps). */
const AFTERIMAGE_DURATION = 6 / 60;

const DODGE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="32" cy="32" rx="24" ry="28" fill="none" stroke="#8B4513" stroke-width="3"/>
  <path d="M20 32 L44 32 M32 18 L32 46" stroke="#c0c0c0" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#8b0000"/>
  <path d="M38 32 L48 32 M44 28 L48 32 L44 36" stroke="#c0c0c0" stroke-width="2" fill="none"/>
</svg>`;

export const DodgeAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Dodge',
    image: DODGE_IMAGE,
    cooldownTime: 0.8,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DODGE_DURATION,
    abilityTimings: [
        { duration: DODGE_DURATION, abilityPhase: AbilityPhase.Iframe },
        { duration: 0.8, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Direction to dodge' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: DODGE_MAX_DISTANCE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Avoid attacks while dodging towards a point',
            'Draw a card',
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < DODGE_DURATION) {
            return [{ state: AbilityState.IFRAMES }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime < 0.05 && currentTime >= 0.05) {
            drawCardForPlayer(engine, caster.ownerId, 1);
        }

        if (currentTime >= DODGE_DURATION) return;

        const pos = getPixelTargetPosition(targets, 0);
        const dirResult = pos ? getDirectionFromTo(caster.x, caster.y, pos.x, pos.y) : null;
        const distToTarget = dirResult?.dist ?? 0;
        const moveDistance =
            distToTarget > 0
                ? Math.min(
                      ((currentTime - prevTime) / DODGE_DURATION) * DODGE_MAX_DISTANCE,
                      distToTarget,
                  )
                : 0;

        // Spawn afterimages every 2 ticks
        const twoTickPeriods = Math.floor(currentTime * 30);
        const prevTwoTickPeriods = prevTime < 0 ? -1 : Math.floor(prevTime * 30);
        const isMoving = moveDistance > 0;

        for (let i = prevTwoTickPeriods + 1; i <= twoTickPeriods; i++) {
            const eng = engine as { addEffect(e: Effect): void };
            const effectData: Record<string, unknown> = {
                bodyColor: getBodyColor(caster.characterId),
                radius: caster.radius,
                characterSpriteKey: getCharacterSpriteKey(caster.characterId),
            };
            if (isMoving && dirResult && dirResult.dist > 0) {
                // Opposite of movement direction, with slight random variance
                const baseAngle = Math.atan2(-dirResult.dirY, -dirResult.dirX);
                const angleVariance = (Math.random() - 0.5) * 0.6;
                const speed = 30 + Math.random() * 20;
                effectData.vx = Math.cos(baseAngle + angleVariance) * speed;
                effectData.vy = Math.sin(baseAngle + angleVariance) * speed;
            } else if (!isMoving) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 30 + Math.random() * 20;
                effectData.vx = Math.cos(angle) * speed;
                effectData.vy = Math.sin(angle) * speed;
            }
            eng.addEffect(
                new Effect({
                    x: caster.x,
                    y: caster.y,
                    duration: AFTERIMAGE_DURATION,
                    effectType: 'Afterimage',
                    effectData,
                }),
            );
        }

        if (!pos || distToTarget === 0 || moveDistance <= 0) return;

        applyForcedDisplacementToward(engine, caster, pos.x, pos.y, moveDistance, { step: COLLISION_STEP });
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Dodge has no attack that can be blocked.
    },

    renderTargetingPreview: createPixelTargetPreview(DODGE_MAX_DISTANCE),
};

export const DodgeCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Dodge',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
