import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createConeTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { getDistanceBasedInaccuracy, getRandomConeAngle, spawnGunProjectile } from '../../abilities/gunHelpers';

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
        const target = targets[0];
        if (!target || target.type !== 'pixel' || !target.position) return;

        const totalWindow = LAST_SHOT_TIME - FIRST_SHOT_TIME;
        const spacing = totalWindow / (NUM_SHOTS - 1);

        for (let i = 0; i < NUM_SHOTS; i++) {
            const t = FIRST_SHOT_TIME + spacing * i;
            if (prevTime < t && currentTime >= t) {
                const dx = target.position.x - caster.x;
                const dy = target.position.y - caster.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) continue;
                const baseAngle = Math.atan2(dy, dx);
                const inaccuracy = getDistanceBasedInaccuracy(dist, INACCURACY_BASE);
                const angle = getRandomConeAngle(engine, baseAngle, inaccuracy);
                const clampedDist = Math.min(dist, MAX_DISTANCE);
                const tx = caster.x + Math.cos(angle) * clampedDist;
                const ty = caster.y + Math.sin(angle) * clampedDist;

                spawnGunProjectile({
                    engine,
                    caster,
                    targetX: tx,
                    targetY: ty,
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
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = MAX_DISTANCE;
        const clampedDist = dist > maxR ? maxR : dist;
        const dirX = dist > 0 ? dx / dist : 1;
        const dirY = dist > 0 ? dy / dist : 0;
        const endX = caster.x + dirX * clampedDist;
        const endY = caster.y + dirY * clampedDist;
        const inaccuracy = getDistanceBasedInaccuracy(dist, INACCURACY_BASE);
        const baseAngle = Math.atan2(dirY, dirX);
        const leftAngle = baseAngle - inaccuracy;
        const rightAngle = baseAngle + inaccuracy;
        const leftEndX = caster.x + Math.cos(leftAngle) * clampedDist;
        const leftEndY = caster.y + Math.sin(leftAngle) * clampedDist;
        const rightEndX = caster.x + Math.cos(rightAngle) * clampedDist;
        const rightEndY = caster.y + Math.sin(rightAngle) * clampedDist;

        ctx.save();
        ctx.strokeStyle = 'rgba(176, 176, 176, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);
        ctx.lineTo(leftEndX, leftEndY);
        ctx.moveTo(caster.x, caster.y);
        ctx.lineTo(rightEndX, rightEndY);
        ctx.strokeStyle = 'rgba(176, 176, 176, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    },

    renderTargetingPreview: createConeTargetPreview({
        maxDistance: MAX_DISTANCE,
        coneAngleRad: INACCURACY_BASE * 2,
    }),
};

export const SMGCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'SMG',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};

