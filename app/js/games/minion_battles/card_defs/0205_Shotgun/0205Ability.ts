import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createConeTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { getDistanceBasedInaccuracy, getRandomConeAngle, spawnGunProjectile } from '../../abilities/gunHelpers';

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
        if (!(prevTime < SHOT_TIME && currentTime >= SHOT_TIME)) return;

        const target = targets[0];
        if (!target || target.type !== 'pixel' || !target.position) return;

        const dx = target.position.x - caster.x;
        const dy = target.position.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const baseAngle = Math.atan2(dy, dx);
        const inaccuracy = getDistanceBasedInaccuracy(dist, INACCURACY_BASE);

        for (let i = 0; i < PELLETS; i++) {
            const angle = getRandomConeAngle(engine, baseAngle, inaccuracy);
            const clampedDist = Math.min(dist, MAX_DISTANCE);
            const tx = caster.x + Math.cos(angle) * clampedDist;
            const ty = caster.y + Math.sin(angle) * clampedDist;

            // Slight randomization of projectile speed per pellet (e.g. 90%–110% of base).
            const eng = engine as { generateRandomInteger?: (min: number, max: number) => number };
            const n = typeof eng.generateRandomInteger === 'function'
                ? eng.generateRandomInteger(0, 1000)
                : Math.floor(Math.random() * 1001);
            const t = n / 1000;
            const speedFactor = 0.9 + 0.2 * t;
            const speed = BULLET_SPEED * speedFactor;

            spawnGunProjectile({
                engine,
                caster,
                targetX: tx,
                targetY: ty,
                damage: BULLET_DAMAGE,
                maxDistance: MAX_DISTANCE,
                speed,
                abilityId: CARD_ID,
            });
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
        ctx.strokeStyle = 'rgba(184, 184, 184, 0.8)';
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
        ctx.strokeStyle = 'rgba(184, 184, 184, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    },

    renderTargetingPreview: createConeTargetPreview({
        maxDistance: MAX_DISTANCE,
        coneAngleRad: INACCURACY_BASE * 2,
    }),
};

export const ShotgunCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Shotgun',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};

