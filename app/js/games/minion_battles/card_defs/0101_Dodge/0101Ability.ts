/**
 * Dodge - Warrior card. Move toward target up to 200px over 0.4s at constant rate.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { drawCardForPlayer, applyForcedDisplacementToward } from '../../abilities/effectHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}01`;
const DODGE_DURATION = 0.4;
const DODGE_MAX_DISTANCE = 160;
/** Step size (px) when testing passability along the dodge path to avoid moving into terrain. */
const COLLISION_STEP = 4;

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
        if (!pos) return;
        const { dist: distToTarget } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (distToTarget === 0) return;

        const moveDistance = Math.min(
            ((currentTime - prevTime) / DODGE_DURATION) * DODGE_MAX_DISTANCE,
            distToTarget,
        );
        if (moveDistance <= 0) return;

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
