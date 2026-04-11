import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createConeTargetPreviewWithDistanceInaccuracy, drawClampedLine } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { fireGunShotAtTarget } from '../../abilities/gunHelpers';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { getPixelTargetPosition } from '../../abilities/targetHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Ranger)}03`;
const PREFIRE_FIRST_SHOT = 0.5;
const COOLDOWN_TIME = 1.3;
const MAX_DISTANCE = 520;
const BULLET_SPEED = 1400;
const BULLET_DAMAGE = 15;
const INACCURACY_BASE = Math.PI / 64;

const PISTOL_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="26" width="28" height="8" rx="2" fill="#c0c0c0" stroke="#a0a0a0" stroke-width="1"/>
  <rect x="24" y="30" width="10" height="14" rx="2" fill="#4a4a4a" stroke="#2c2c2c" stroke-width="1"/>
  <rect x="38" y="28" width="10" height="4" rx="1" fill="#e0e0e0" />
</svg>`;

export const PistolAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Pistol',
    image: PISTOL_IMAGE,
    cooldownTime: COOLDOWN_TIME,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_FIRST_SHOT,
    abilityTimings: [
        { duration: PREFIRE_FIRST_SHOT, abilityPhase: AbilityPhase.Windup },
        { duration: COOLDOWN_TIME, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [
        { type: 'pixel', label: 'First shot' },
        { type: 'pixel', label: 'Second shot' },
        { type: 'pixel', label: 'Third shot' },
    ] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },

    getTooltipText(): string[] {
        return [
            'Fire 3 precise shots dealing {15} damage each',
        ];
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const shotTimes = [0.5, 0.7, 0.9];
        for (let i = 0; i < shotTimes.length; i++) {
            const t = shotTimes[i]!;
            if (prevTime >= t || currentTime < t) continue;
            const pos = getPixelTargetPosition(targets, i);
            if (!pos) continue;
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
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreview: createConeTargetPreviewWithDistanceInaccuracy(MAX_DISTANCE, INACCURACY_BASE),

    renderTargetingPreviewSelectedTargets(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        _mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): void {
        for (let i = 0; i < currentTargets.length; i++) {
            const pos = getPixelTargetPosition(currentTargets, i);
            if (pos) drawClampedLine(gr, caster, pos, MAX_DISTANCE);
        }
    },
};

export const PistolCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Pistol',
    abilityId: CARD_ID,
    durability: 3,
    discardDuration: { duration: 1, unit: 'rounds' },
};

