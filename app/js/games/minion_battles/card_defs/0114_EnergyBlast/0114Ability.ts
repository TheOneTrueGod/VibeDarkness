import type { AbilityStatic, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../../abilities/targetHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { asCardDefId, type CardDef } from '../types';

const CARD_ID = '0114';
const RANGE = 260;
const DAMAGE = 18;
const PROJECTILE_SPEED = 600;
const PROJECTILE_RADIUS = 12;
const PREVIEW_COLOR = 0x8be9ff;

interface EnergyBlastEngineLike {
    addProjectile(projectile: Projectile): void;
}

const ENERGY_BLAST_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="20" fill="#71ddff" opacity="0.35"/>
  <circle cx="32" cy="32" r="14" fill="#9feeff" opacity="0.7"/>
  <circle cx="32" cy="32" r="8" fill="#d7fbff"/>
</svg>`;

export const EnergyBlastAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Energy Blast',
    image: ENERGY_BLAST_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0.2,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: 0.2,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'projectile',
            start: 0.2,
            end: 0.55,
            abilityPhase: AbilityPhase.Active,
        },
        {
            id: 'recover',
            start: 0.55,
            end: 0.95,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Fire a pulsing energy projectile',
            'Deals {18} damage to the first target hit',
            'Recovers with {3} energy charges',
        ];
    },

    getAbilityStates(): [] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= 0.2 || currentTime < 0.2) return;
        const targetPos = getPixelTargetPosition(targets, 0);
        if (!targetPos) return;
        const clamped = clampToMaxRange(caster, targetPos, RANGE);
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, clamped.endX, clamped.endY);
        if (dist === 0) return;
        const projectile = new Projectile({
            x: caster.x,
            y: caster.y,
            velocityX: dirX * PROJECTILE_SPEED,
            velocityY: dirY * PROJECTILE_SPEED,
            damage: DAMAGE,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: CARD_ID,
            maxDistance: Math.min(dist, RANGE),
            projectileType: 'energy_blast',
        });
        projectile.radius = PROJECTILE_RADIUS;
        (engine as EnergyBlastEngineLike).addProjectile(projectile);
    },

    renderTargetingPreview(gr, caster, _currentTargets, mouseWorld): void {
        gr.clear();
        drawClampedLine(gr, caster, mouseWorld, RANGE, { color: PREVIEW_COLOR, width: 2, alpha: 0.8 });
        const clamped = clampToMaxRange(caster, mouseWorld, RANGE);
        drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: PREVIEW_COLOR, width: 2, alpha: 0.95 });
        gr.circle(clamped.endX, clamped.endY, PROJECTILE_RADIUS);
        gr.stroke({ color: PREVIEW_COLOR, width: 2, alpha: 0.55 });
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as Projectile).active = false;
        }
    },
};

export const EnergyBlastCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Energy Blast',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
