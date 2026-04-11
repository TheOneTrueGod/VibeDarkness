import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createConeTargetPreviewWithDistanceInaccuracy } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { fireGunShotAtTarget, getRandomSpeedFactor } from '../../abilities/gunHelpers';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { getPixelTargetPosition } from '../../abilities/targetHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Ranger)}05`;
const SHOT_TIME = 0.5;
const COOLDOWN_TIME = 1.3;
const MAX_DISTANCE = 224;
const BULLET_SPEED = 1300;
const BULLET_DAMAGE = 10;
const PELLETS = 6;
const INACCURACY_BASE = Math.PI / 16;

const SHOTGUN_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="28" width="40" height="6" rx="2" fill="#b8b8b8" stroke="#909090" stroke-width="1"/>
  <rect x="24" y="32" width="10" height="14" rx="2" fill="#3b2a1a" stroke="#1f140c" stroke-width="1"/>
  <rect x="12" y="34" width="8" height="8" rx="2" fill="#5c4033" />
</svg>`;

export const ShotgunAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Shotgun',
    image: SHOTGUN_IMAGE,
    cooldownTime: COOLDOWN_TIME,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: SHOT_TIME,
    abilityTimings: [
        { duration: SHOT_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: COOLDOWN_TIME, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Blast direction' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },

    getTooltipText(): string[] {
        return [
            `Fire ${PELLETS} pellets in a cone`,
            'Each pellet deals {10} damage',
        ];
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= SHOT_TIME || currentTime < SHOT_TIME) return;
        const pos = getPixelTargetPosition(targets, 0);
        if (!pos) return;

        for (let i = 0; i < PELLETS; i++) {
            const speed = BULLET_SPEED * getRandomSpeedFactor(engine, 0.9, 1.1);
            fireGunShotAtTarget({
                engine,
                caster,
                targetX: pos.x,
                targetY: pos.y,
                damage: BULLET_DAMAGE,
                maxDistance: MAX_DISTANCE,
                speed,
                abilityId: CARD_ID,
                baseInaccuracy: INACCURACY_BASE,
            });
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreview: createConeTargetPreviewWithDistanceInaccuracy(MAX_DISTANCE, INACCURACY_BASE),
};

export const ShotgunCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Shotgun',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};

