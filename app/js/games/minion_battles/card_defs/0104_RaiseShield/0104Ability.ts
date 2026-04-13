/**
 * Raise Shield - Warrior skill. Hold a shield for 1s in a direction.
 * Movement speed penalty 0.1, blocks attacks from within a 120° arc.
 * Single use directional block.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createArcTargetPreview, drawArcWedge } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { isAbilityNote } from '../../game/AbilityNote';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { getDirectionFromTo } from '../../abilities/targetHelpers';
import { grantRecoveryChargeToRandomAbility } from '../../abilities/abilityUses';
import { areEnemies } from '../../game/teams';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}04`;
const DURATION = 1;
const COOLDOWN_TIME = 1;
const MOVEMENT_PENALTY = 0.1;
const SHIELD_ARC_DEG = 120;
const SHIELD_ARC_RAD = (SHIELD_ARC_DEG * Math.PI) / 180;
const SHIELD_HALF_ARC_RAD = SHIELD_ARC_RAD / 2;
// Inner radius is the "start" of the visual block, so keep it slightly outside the unit.
const SHIELD_INNER_OFFSET = 5; // from creature's size (radius)
const SHIELD_THICKNESS_PX = 10;
const SHIELD_FILL_ALPHA = 0.9;
const SHIELD_STROKE_ALPHA = 0.9;
const MAX_RANGE = 300;
const MIN_RANGE = 10;

const SHIELD_FILL_COLOR = 0xbdbdbd;
const SHIELD_STROKE_COLOR = 0x878787;
const ALLY_CHARGE_RADIUS = 180;

interface RaiseShieldEngineLike {
    units: Unit[];
    generateRandomInteger(min: number, max: number): number;
}

const RAISE_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="#6B8E6B" stroke="#4A6B4A" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#3d5c3d"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#8B7355" stroke-width="2"/>
</svg>`;

export const RaiseShieldAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Raise Shield',
    image: RAISE_SHIELD_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DURATION,
    abilityTimings: [
        {
            id: 'shield',
            start: 0,
            end: DURATION,
            abilityPhase: AbilityPhase.Juggernaut,
        },
        {
            id: 'cooldown',
            start: DURATION,
            end: DURATION + COOLDOWN_TIME,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Direction to block' }] as TargetDef[],
    aiSettings: { minRange: MIN_RANGE, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise your shield blocking all attacks from the front',
            'Blocks attacks from the front arc',
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < DURATION) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: MOVEMENT_PENALTY } }];
        }
        return [];
    },

    getBlockingArc(caster: Unit, activeAbility: { targets: ResolvedTarget[] }, currentTime: number) {
        if (currentTime < 0 || currentTime >= DURATION) return null;
        const pos = activeAbility.targets[0]?.position;
        if (!pos) return null;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return null;
        const centerAngle = Math.atan2(dirY, dirX);
        return {
            arcStartAngle: centerAngle - SHIELD_HALF_ARC_RAD,
            arcEndAngle: centerAngle + SHIELD_HALF_ARC_RAD,
        };
    },

    doCardEffect(_engine: unknown, caster: Unit, _targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= 0.05 || currentTime < 0.05) return;
        caster.setAbilityNote({ abilityId: '0104', abilityNote: { blockCount: 0 } });
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number; targets: ResolvedTarget[] },
        _gameTime: number,
    ): void {
        const pos = activeAbility.targets[0]?.position;
        if (!pos) return;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return;
        const centerAngle = Math.atan2(dirY, dirX);
        const innerR = caster.radius + SHIELD_INNER_OFFSET;
        const outerR = caster.radius + SHIELD_THICKNESS_PX;
        drawArcWedge(gr, caster.x, caster.y, centerAngle, SHIELD_HALF_ARC_RAD, innerR, outerR, 24, {
            fillAlpha: SHIELD_FILL_ALPHA,
            strokeAlpha: SHIELD_STROKE_ALPHA,
            strokeColor: SHIELD_STROKE_COLOR,
            fillColor: SHIELD_FILL_COLOR,
        });
    },

    renderTargetingPreview: createArcTargetPreview({
        arcDeg: SHIELD_ARC_DEG,
        innerOffset: SHIELD_INNER_OFFSET,
        outerThickness: SHIELD_THICKNESS_PX,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
        strokeColor: SHIELD_STROKE_COLOR,
        fillColor: SHIELD_FILL_COLOR,
    }),

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Not used; we are the blocker, not the attacker.
    },

    onBlockSuccess(engine: unknown, defender: Unit, _attackInfo: AttackBlockedInfo): void {
        if (!defender.ownerId) return;
        const note = defender.abilityNote;
        if (!isAbilityNote(note, '0104')) return;
        const nextCount = (note.abilityNote.blockCount ?? 0) + 1;
        const wasRewarded = Boolean(note.abilityNote.rewardedTwiceBlock);
        if (nextCount >= 2 && !wasRewarded) {
            const eng = engine as RaiseShieldEngineLike;
            grantRecoveryChargeToRandomAbility(
                defender,
                'staminaCharge',
                (min, max) => eng.generateRandomInteger(min, max),
                { excludeAbilityId: CARD_ID },
            );
            for (const ally of eng.units) {
                if (!ally.isAlive() || ally.id === defender.id) continue;
                if (areEnemies(ally.teamId, defender.teamId)) continue;
                const dist = Math.hypot(ally.x - defender.x, ally.y - defender.y);
                if (dist > ALLY_CHARGE_RADIUS) continue;
                grantRecoveryChargeToRandomAbility(
                    ally,
                    'staminaCharge',
                    (min, max) => eng.generateRandomInteger(min, max),
                );
                grantRecoveryChargeToRandomAbility(
                    ally,
                    'staminaCharge',
                    (min, max) => eng.generateRandomInteger(min, max),
                );
            }
        }
        defender.setAbilityNote({
            abilityId: '0104',
            abilityNote: {
                blockCount: nextCount,
                rewardedTwiceBlock: wasRewarded || nextCount >= 2,
            },
        });
    },
};

export const RaiseShieldCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Raise Shield',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
