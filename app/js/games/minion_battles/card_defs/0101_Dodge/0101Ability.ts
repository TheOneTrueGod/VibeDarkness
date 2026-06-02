/**
 * Dodge - Warrior card. Move toward target up to DODGE_MAX_DISTANCE px over 0.4 s at constant rate
 * (terrain may shorten travel). The iframe window grants invincibility; a stamina charge is given
 * to a random other ability on cast. An afterimage trail follows the unit throughout the dash.
 */

import { AbilityState, AbilityEventType } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { Unit } from '../../game/units/Unit';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { computeForcedDisplacement } from '../../game/forceMove';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { CastBehaviours } from '../../abilities/CastBehaviours';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}01`;
const DODGE_DURATION = 0.4;
/** Max travel distance (px); preview uses the same value with {@link computeForcedDisplacement}. */
export const DODGE_MAX_DISTANCE = 140;
/** Step size (px) when testing passability along the dodge path to avoid moving into terrain. */
export const DODGE_COLLISION_STEP = 4;

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
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DODGE_DURATION,
    abilityTimings: [
        {
            id: 'iframe',
            start: 0,
            end: DODGE_DURATION,
            abilityPhase: AbilityPhase.Iframe,
            behaviour: CastBehaviours.Dash()
                .withMaxDistance(DODGE_MAX_DISTANCE)
                .withCollisionStep(DODGE_COLLISION_STEP)
                .withAfterimages(true),
        },
    ],
    targets: [{ type: 'pixel', label: 'Direction to dodge' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: DODGE_MAX_DISTANCE },

    abilityEvents: {
        [AbilityEventType.ON_CAST_START]: [
            {
                id: 'dodge-stamina-charge',
                conditions: [{ type: 'always' }],
                effects: [{ type: 'recoverCharge', chargeType: 'staminaCharge', amount: 1, excludeSelf: true }],
            },
        ],
    },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Avoid attacks while dodging towards a point',
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < DODGE_DURATION) {
            return [{ state: AbilityState.IFRAMES }];
        }
        return [];
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Dodge has no attack that can be blocked.
    },

    renderTargetingPreview(gr, caster, _currentTargets, mouseWorld, _units, gameState): void {
        gr.clear();
        const terrainManager =
            gameState && typeof gameState === 'object' && 'terrainManager' in gameState
                ? ((gameState as { terrainManager?: TerrainManager | null }).terrainManager ?? null)
                : null;
        const { dx, dy, distance } = computeForcedDisplacement(
            caster.x,
            caster.y,
            mouseWorld.x,
            mouseWorld.y,
            DODGE_MAX_DISTANCE,
            { terrainManager, step: DODGE_COLLISION_STEP },
        );
        if (distance <= 0) return;
        gr.moveTo(caster.x, caster.y);
        gr.lineTo(caster.x + dx, caster.y + dy);
        gr.stroke({ color: 0xc0c0c0, width: 2, alpha: 0.6 });
    },
};

export const DodgeCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Dodge',
    abilityId: CARD_ID,
    discardDuration: { duration: 1, unit: 'rounds' },
};
