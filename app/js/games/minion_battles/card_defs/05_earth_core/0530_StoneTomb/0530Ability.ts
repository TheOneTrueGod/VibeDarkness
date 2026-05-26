import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { getDirectionFromTo, getPixelTargetPosition } from '../../../abilities/targetHelpers';
import { areEnemies } from '../../../game/teams';
import type { EventBus } from '../../../game/EventBus';
import type { Unit } from '../../../game/units/Unit';
import { Projectile } from '../../../game/projectiles/Projectile';
import { Effect } from '../../../game/effects/Effect';
import type { ResolvedTarget } from '../../../game/types';
import { asCardDefId, type CardDef } from '../../types';

const ABILITY_ID = '0530';
const RANGE = 220;
const DAMAGE = 5;
const IMPACT_RADIUS = 55;
const KNOCKBACK_MAGNITUDE = 30;
const KNOCKBACK_POISE_DAMAGE = 3;
const KNOCKBACK_AIR_TIME = 0.12;
const KNOCKBACK_SLIDE_TIME = 0.09;
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.3, abilityPhase: AbilityPhase.Windup },
    { id: 'active', start: 0.3, end: 1.0, abilityPhase: AbilityPhase.Active },
    { id: 'cooldown', start: 1.0, end: 1.5, abilityPhase: AbilityPhase.Cooldown },
];

const STONE_TOMB_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="8" width="28" height="24" rx="4" fill="#6b6b6b"/>
  <path d="M10 14 L30 14 M10 20 L30 20 M10 26 L30 26" stroke="#bdbdbd" stroke-width="2"/>
</svg>`;

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
    addEffect(effect: Effect): void;
    getUnit(id: string): Unit | undefined;
    getUnits(): Unit[];
    eventBus: EventBus;
    terrainManager?: {
        grid: {
            worldToGrid(x: number, y: number): { col: number; row: number };
        };
        createOrMarkRock(col: number, row: number): unknown;
    };
}

export const StoneTomb: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Stone Tomb',
    image: STONE_TOMB_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: 1,
    prefireTime: 0.3,
    abilityTimings: TIMINGS,
    targets: [{ type: 'pixel', label: 'Impact location' }],
    aiSettings: { minRange: 0, maxRange: RANGE },
    getTooltipText(): string[] {
        return ['Throw a rock that creates stone, dealing {5} damage and knocking back nearby enemies.'];
    },
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= 0.3 || currentTime < 0.3) return;
        const target = getPixelTargetPosition(targets, 0);
        if (!target) return;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
        if (dist <= 0) return;
        (engine as GameEngineLike).addProjectile(
            new Projectile({
                x: caster.x,
                y: caster.y,
                velocityX: dirX * 900,
                velocityY: dirY * 900,
                damage: DAMAGE,
                sourceTeamId: caster.teamId,
                sourceUnitId: caster.id,
                sourceAbilityId: ABILITY_ID,
                maxDistance: Math.min(RANGE, dist),
                projectileType: 'charged_rock',
            }),
        );
    },
    getAbilityStates(): [] {
        return [];
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as Projectile).active = false;
        }
    },
    onProjectileExpired(engine: unknown, caster: Unit, projectile: Projectile): void {
        const eng = engine as GameEngineLike;
        const source = eng.getUnit(caster.id);
        if (!source) return;

        const worldGrid = eng.terrainManager?.grid.worldToGrid(projectile.x, projectile.y);
        if (worldGrid) {
            eng.terrainManager?.createOrMarkRock(worldGrid.col, worldGrid.row);
        }

        eng.addEffect(new Effect({
            x: projectile.x,
            y: projectile.y,
            duration: 0.2,
            effectType: 'ChargedRockExplosion',
            effectRadius: IMPACT_RADIUS,
        }));

        for (const unit of eng.getUnits()) {
            if (!unit.isAlive() || !areEnemies(source.teamId, unit.teamId)) continue;
            const dist = Math.hypot(unit.x - projectile.x, unit.y - projectile.y);
            if (dist > IMPACT_RADIUS + unit.radius) continue;
            unit.takeDamage(DAMAGE, source.id, eng.eventBus);
            const { dirX, dirY } = getDirectionFromTo(projectile.x, projectile.y, unit.x, unit.y);
            unit.applyKnockback(
                KNOCKBACK_POISE_DAMAGE,
                {
                    knockbackVector: { x: dirX * KNOCKBACK_MAGNITUDE, y: dirY * KNOCKBACK_MAGNITUDE },
                    knockbackAirTime: KNOCKBACK_AIR_TIME,
                    knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                    knockbackSource: { unitId: source.id, abilityId: ABILITY_ID },
                },
                eng.eventBus,
            );
        }
    },
};

export const StoneTombCard: CardDef = {
    id: asCardDefId('0530'),
    name: 'Stone Tomb',
    abilityId: ABILITY_ID,
    discardDuration: { duration: 1, unit: 'rounds' },
};
