import type { AbilityStatic, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../../abilities/targetHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { Effect } from '../../game/effects/Effect';
import { areEnemies } from '../../game/teams';
import type { EventBus } from '../../game/EventBus';
import { getModifiedAbilityDamage } from '../../abilities/damageModifiers';
import { asCardDefId, type CardDef } from '../types';

const CARD_ID = '0114';
const RANGE = 100;
const DAMAGE = 0;
const EXPLOSION_RADIUS = 40;
const EXPLOSION_DAMAGE = 30;
const MAX_EXPLOSION_TARGETS = 4;
const PROJECTILE_SPEED = 600;
const PROJECTILE_RADIUS = 12;
const PREVIEW_COLOR = 0x8be9ff;

const KNOCKBACK_MAGNITUDE = 20;
const KNOCKBACK_POISE_DAMAGE = 2;
const KNOCKBACK_AIR_TIME = 0.08;
const KNOCKBACK_SLIDE_TIME = 0.06;

interface EnergyBlastEngineLike {
    addProjectile(projectile: Projectile): void;
    addEffect(effect: Effect): void;
    getUnit(id: string): Unit | undefined;
    getUnits(): Unit[];
    eventBus: EventBus;
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
            `Explodes, dealing {${EXPLOSION_DAMAGE}} to up to {${MAX_EXPLOSION_TARGETS}} enemies`,
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

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as Projectile).active = false;
        }
    },

    onProjectileExpired(engine: unknown, caster: Unit, projectile: Projectile, _hitUnitId?: string): void {
        const eng = engine as EnergyBlastEngineLike;
        const sourceUnit = eng.getUnit(caster.id);
        if (!sourceUnit) return;

        eng.addEffect(
            new Effect({
                x: projectile.x,
                y: projectile.y,
                duration: 0.25,
                effectType: 'EnergyBlastExplosion',
                effectRadius: EXPLOSION_RADIUS,
            }),
        );

        const units = eng
            .getUnits()
            .filter((u) => u.isAlive() && areEnemies(sourceUnit.teamId, u.teamId))
            .map((u) => ({ unit: u, dist: Math.hypot(u.x - projectile.x, u.y - projectile.y) }))
            .filter((entry) => entry.dist <= EXPLOSION_RADIUS + entry.unit.radius)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, MAX_EXPLOSION_TARGETS)
            .map((entry) => entry.unit);

        for (const unit of units) {
            const modifiedDamage = getModifiedAbilityDamage(sourceUnit, EXPLOSION_DAMAGE);
            unit.takeDamage(modifiedDamage, sourceUnit.id, eng.eventBus);
            const { dirX, dirY } = getDirectionFromTo(projectile.x, projectile.y, unit.x, unit.y);
            unit.applyKnockback(
                KNOCKBACK_POISE_DAMAGE,
                {
                    knockbackVector: { x: dirX * KNOCKBACK_MAGNITUDE, y: dirY * KNOCKBACK_MAGNITUDE },
                    knockbackAirTime: KNOCKBACK_AIR_TIME,
                    knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                    knockbackSource: { unitId: sourceUnit.id, abilityId: CARD_ID },
                },
                eng.eventBus,
            );
        }
    },

    renderTargetingPreview(gr, caster, _currentTargets, mouseWorld): void {
        gr.clear();
        if (!mouseWorld) return;
        const clamped = clampToMaxRange(caster, mouseWorld, RANGE);
        const impactX = clamped.endX;
        const impactY = clamped.endY;

        drawClampedLine(gr, caster, mouseWorld, RANGE, { color: PREVIEW_COLOR, width: 2, alpha: 0.8 });
        drawCrosshair(gr, impactX, impactY, 10, { color: PREVIEW_COLOR, width: 2, alpha: 0.95 });
        gr.circle(impactX, impactY, EXPLOSION_RADIUS);
        gr.fill({ color: PREVIEW_COLOR, alpha: 0.15 });
        gr.circle(impactX, impactY, EXPLOSION_RADIUS);
        gr.stroke({ color: PREVIEW_COLOR, width: 2, alpha: 0.5 });
    },
};

export const EnergyBlastCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Energy Blast',
    abilityId: CARD_ID,
    discardDuration: { duration: 1, unit: 'rounds' },
};
