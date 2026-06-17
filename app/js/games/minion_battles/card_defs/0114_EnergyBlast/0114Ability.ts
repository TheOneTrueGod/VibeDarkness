import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityEventType } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { type CardDef } from '../types';
import { HitboxSpec } from '../../hitboxes';
import type { HitboxEngineContext, HitboxPreviewCaster } from '../../hitboxes';
import type { Unit } from '../../game/units/Unit';

const CARD_ID = '0114';
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 },
];
const RANGE = 100;
const EXPLOSION_RADIUS = 40;
const EXPLOSION_DAMAGE = 30;
const MAX_EXPLOSION_TARGETS = 5;
const PROJECTILE_SPEED = 600;
const PROJECTILE_RADIUS = 12;
const PREVIEW_COLOR = 0x8be9ff;

const KNOCKBACK_TIER = 1;

class EnergyBlastHitboxSpec extends HitboxSpec {
    get maxRange(): number { return RANGE; }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const clamped = clampToMaxRange(caster as { x: number; y: number }, mouseWorld, RANGE);
        const impactX = clamped.endX;
        const impactY = clamped.endY;
        drawClampedLine(gr, caster as { x: number; y: number }, mouseWorld, RANGE, { color: PREVIEW_COLOR, width: 2, alpha: 0.8 });
        drawCrosshair(gr, impactX, impactY, 10, { color: PREVIEW_COLOR, width: 2, alpha: 0.95 });
        gr.circle(impactX, impactY, EXPLOSION_RADIUS);
        gr.fill({ color: PREVIEW_COLOR, alpha: 0.15 });
        gr.circle(impactX, impactY, EXPLOSION_RADIUS);
        gr.stroke({ color: PREVIEW_COLOR, width: 2, alpha: 0.5 });
        return units.filter(
            (u) => u.isAlive() && Math.hypot(u.x - impactX, u.y - impactY) <= EXPLOSION_RADIUS + u.radius,
        );
    }

    resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        return units.filter(
            (u) => u.id !== caster.id && u.isAlive() &&
                Math.hypot(u.x - aimPoint.x, u.y - aimPoint.y) <= EXPLOSION_RADIUS + u.radius,
        );
    }

    resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
    ): Unit[] {
        return engine.units.filter(
            (u) => u.id !== caster.id && u.isAlive() &&
                Math.hypot(u.x - aimX, u.y - aimY) <= EXPLOSION_RADIUS + u.radius,
        );
    }
}

const ENERGY_BLAST_HITBOX = new EnergyBlastHitboxSpec();

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
    maxUses: MAX_USES,
    startingUses: 0,
    recoveries: RECOVERIES,
    prefireTime: 0.2,
    abilityTimings: [
        { id: 'windup',   start: 0,    end: 0.2,  abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: 0.2,
            end: 0.3,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Target location', hitbox: ENERGY_BLAST_HITBOX, filter: 'enemy', allowMiss: true },
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(PROJECTILE_SPEED)
                .withRadius(PROJECTILE_RADIUS)
                .withProjectileType('energy_blast')
                .withMaxRange(RANGE),
        },
        { id: 'cooldown', start: 0.3, end: 0.95, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    aiSettings: { minRange: 0, maxRange: RANGE },

    abilityEvents: {
        [AbilityEventType.ON_PROJECTILE_EXPIRED]: [
            {
                conditions: [{ type: 'always' }],
                effects: [
                    {
                        type: 'triggerAoEExplosion',
                        effectType: 'EnergyBlastExplosion',
                        effectRadius: EXPLOSION_RADIUS,
                        damage: EXPLOSION_DAMAGE,
                        maxTargets: MAX_EXPLOSION_TARGETS,
                        knockbackTier: KNOCKBACK_TIER,
                    },
                ],
            },
        ],
    },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Fire a pulsing energy projectile',
            `Explodes, dealing {${EXPLOSION_DAMAGE}} to up to {${MAX_EXPLOSION_TARGETS}} enemies`,
        ];
    },

    getAbilityStates(): [] {
        return [];
    },

};

export const EnergyBlastCard: CardDef = {
    abilityId: CARD_ID,
};
