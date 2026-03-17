import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createConeTargetPreviewWithDistanceInaccuracy } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { fireGunShotAtTarget } from '../../abilities/gunHelpers';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { getPixelTargetPosition } from '../../abilities/targetHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Ranger)}04`;
const FIRST_SHOT_TIME = 0.5;
const LAST_SHOT_TIME = 1.0;
const NUM_SHOTS = 8;
const COOLDOWN_TIME = 1.3;
const MAX_DISTANCE = 380;
const BULLET_SPEED = 1500;
const BULLET_DAMAGE = 10;
const INACCURACY_BASE = Math.PI / 16;

const SMG_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="26" width="32" height="8" rx="2" fill="#b0b0b0" stroke="#909090" stroke-width="1"/>
  <rect x="22" y="30" width="10" height="12" rx="2" fill="#3a3a3a" stroke="#202020" stroke-width="1"/>
  <rect x="34" y="24" width="12" height="6" rx="1" fill="#d0d0d0" />
  <rect x="18" y="34" width="6" height="10" rx="1" fill="#5a5a5a" />
</svg>`;

export const SMGAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'SMG',
    image: SMG_IMAGE,
    cooldownTime: COOLDOWN_TIME,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: LAST_SHOT_TIME,
    abilityTimings: [
        { duration: LAST_SHOT_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: COOLDOWN_TIME, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Spray direction' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },

    getTooltipText(): string[] {
        return [
            'Spray {8} bullets in a cone',
            'Each bullet deals {10} damage',
        ];
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const pos = getPixelTargetPosition(targets, 0);
        if (!pos) return;

        const totalWindow = LAST_SHOT_TIME - FIRST_SHOT_TIME;
        const spacing = totalWindow / (NUM_SHOTS - 1);

        for (let i = 0; i < NUM_SHOTS; i++) {
            const t = FIRST_SHOT_TIME + spacing * i;
            if (prevTime < t && currentTime >= t) {
                fireGunShotAtTarget({
                    engine,
                    caster,
                    targetX: pos.x,
                    targetY: pos.y,
                    damage: BULLET_DAMAGE,
                    maxDistance: MAX_DISTANCE,
                    speed: BULLET_SPEED,
                    abilityId: CARD_ID,
                    baseInaccuracy: INACCURACY_BASE,
                });
            }
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreview: createConeTargetPreviewWithDistanceInaccuracy(MAX_DISTANCE, INACCURACY_BASE),
};

export const SMGCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'SMG',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};

