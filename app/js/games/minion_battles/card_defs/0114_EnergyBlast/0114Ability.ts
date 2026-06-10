import type { AbilityRecoveryRule, AbilityStatic } from '../../abilities/Ability';
import { AbilityEventType } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { type CardDef } from '../types';

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
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(PROJECTILE_SPEED)
                .withRadius(PROJECTILE_RADIUS)
                .withProjectileType('energy_blast')
                .withMaxRange(RANGE),
        },
        { id: 'cooldown', start: 0.3, end: 0.95, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
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
    abilityId: CARD_ID,
};
