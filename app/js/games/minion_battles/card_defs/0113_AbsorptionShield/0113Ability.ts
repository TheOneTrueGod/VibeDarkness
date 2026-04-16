import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createArcTargetPreview, drawArcWedge } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { getDirectionFromTo } from '../../abilities/targetHelpers';
import { grantRecoveryChargeToRandomAbility } from '../../abilities/abilityUses';
import { asCardDefId, type CardDef } from '../types';

const CARD_ID = '0113';
const DURATION = 1;
const COOLDOWN_TIME = 1;
const MOVEMENT_PENALTY = 0.1;
const SHIELD_ARC_DEG = 120;
const SHIELD_ARC_RAD = (SHIELD_ARC_DEG * Math.PI) / 180;
const SHIELD_HALF_ARC_RAD = SHIELD_ARC_RAD / 2;
const SHIELD_INNER_OFFSET = 5;
const SHIELD_THICKNESS_PX = 10;
const SHIELD_FILL_ALPHA = 0.9;
const SHIELD_STROKE_ALPHA = 0.9;
const SHIELD_FILL_COLOR = 0x7de2f5;
const SHIELD_STROKE_COLOR = 0x35a7c1;
const MAX_RANGE = 300;
const MIN_RANGE = 10;

interface AbsorptionShieldEngineLike {
    generateRandomInteger(min: number, max: number): number;
}

const ABSORPTION_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="#67d4ea" stroke="#2ca7c7" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#0f5e73"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#d9f8ff" stroke-width="2"/>
</svg>`;

export const AbsorptionShieldAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Absorption Shield',
    image: ABSORPTION_SHIELD_IMAGE,
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
            'Raise your shield to block attacks from the front',
            'On Block: Gain {1} energy charge',
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

    doCardEffect(_engine: unknown, _caster: Unit, _targets: ResolvedTarget[], _prevTime: number, _currentTime: number): void {
        // Pure defensive stance while active; no per-tick action needed.
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
        // Not used; this ability is the blocker.
    },

    onBlockSuccess(engine: unknown, defender: Unit, _attackInfo: AttackBlockedInfo): void {
        const eng = engine as AbsorptionShieldEngineLike;
        grantRecoveryChargeToRandomAbility(
            defender,
            'energyCharge',
            (min, max) => eng.generateRandomInteger(min, max),
            { excludeAbilityId: CARD_ID },
        );
    },
};

export const AbsorptionShieldCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Absorption Shield',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
