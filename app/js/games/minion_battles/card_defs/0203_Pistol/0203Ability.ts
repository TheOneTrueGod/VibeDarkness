import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createConeTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { spawnGunProjectile } from '../../abilities/gunHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Ranger)}03`;
const PREFIRE_LAST_SHOT = 0.9;
const COOLDOWN_TIME = 1.3;
const MAX_DISTANCE = 400;
const BULLET_SPEED = 1400;
const BULLET_DAMAGE = 15;
const CONE_ANGLE_RAD = Math.PI / 32;

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
    prefireTime: PREFIRE_LAST_SHOT,
    abilityTimings: [
        { duration: PREFIRE_LAST_SHOT, abilityPhase: AbilityPhase.Windup },
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
            if (prevTime < t && currentTime >= t) {
                const target = targets[i];
                if (!target || target.type !== 'pixel' || !target.position) continue;

                spawnGunProjectile({
                    engine,
                    caster,
                    targetX: target.position.x,
                    targetY: target.position.y,
                    damage: BULLET_DAMAGE,
                    maxDistance: MAX_DISTANCE,
                    speed: BULLET_SPEED,
                    abilityId: CARD_ID,
                });
            }
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as { active: boolean }).active = false;
        }
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        ctx.save();
        ctx.strokeStyle = 'rgba(192, 192, 192, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = MAX_DISTANCE;
        const endX = dist > maxR ? caster.x + (dx / dist) * maxR : mouseWorld.x;
        const endY = dist > maxR ? caster.y + (dy / dist) * maxR : mouseWorld.y;
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.restore();
    },

    renderTargetingPreview: createConeTargetPreview({
        maxDistance: MAX_DISTANCE,
        coneAngleRad: CONE_ANGLE_RAD,
    }),
};

export const PistolCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Pistol',
    abilityId: CARD_ID,
    durability: 3,
    discardDuration: { duration: 1, unit: 'rounds' },
};

