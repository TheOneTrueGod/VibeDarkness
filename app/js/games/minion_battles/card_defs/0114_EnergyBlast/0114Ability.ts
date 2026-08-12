import type { AbilityRecoveryRule, AbilityStatic } from '../../abilities/Ability';
import { AbilityEventType } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';
import { type CardDef } from '../types';
import { circleAoEHitbox } from '../../hitboxes';

const CARD_ID = '0114';
const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 },
];
const RANGE = 100;
const EXPLOSION_RADIUS = 40;
export const ENERGY_BLAST_EXPLOSION_DAMAGE = 30;
const EXPLOSION_DAMAGE = ENERGY_BLAST_EXPLOSION_DAMAGE;
const MAX_EXPLOSION_TARGETS = 5;
const PROJECTILE_SPEED = 600;
const PROJECTILE_RADIUS = 12;
const PREVIEW_COLOR = 0x8be9ff;

const KNOCKBACK_TIER = 1;

const TOOLTIP_LINES = [
    'Fire a pulsing energy projectile',
    'Explodes, dealing {{DAMAGE}} to up to {{MAX_TARGETS}} enemies',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: EXPLOSION_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MAX_EXPLOSION_TARGETS },
};

const ENERGY_BLAST_HITBOX = circleAoEHitbox({
    castRange: RANGE,
    aoeRadius: EXPLOSION_RADIUS,
    numTargets: MAX_EXPLOSION_TARGETS,
    previewStyle: {
        color: PREVIEW_COLOR,
        lineWidth: 2,
        lineAlpha: 0.8,
        fillAlpha: 0.15,
        strokeAlpha: 0.5,
        showCrosshair: true,
    },
});

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
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Target location',
                hitbox: ENERGY_BLAST_HITBOX,
                filter: 'enemy',
                allowMiss: true,
                lockOnMode: 'strictHitbox',
            },
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
                        effectType: 'Explosion',
                        effectProperties: { color: 0x8be9ff, direction: 'contract' },
                        effectRadius: EXPLOSION_RADIUS,
                        damage: EXPLOSION_DAMAGE,
                        maxTargets: MAX_EXPLOSION_TARGETS,
                        knockbackTier: KNOCKBACK_TIER,
                    },
                ],
            },
        ],
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },

    getAbilityStates(): [] {
        return [];
    },

};

export const EnergyBlastCard: CardDef = {
    abilityId: CARD_ID,
};
