import type { AbilityRecoveryRule, AbilityStatic } from '../../abilities/Ability';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { defineGunAbility } from '../../abilities/archetypes/defineGunAbility';
import {
    ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES,
    DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
} from '../../abilities/damageModifiers';
import { resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';

const CARD_ID = `${formatGroupId(AbilityGroupId.Ranger)}03`;
const MAX_USES = 3;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const PREFIRE_FIRST_SHOT = 0.5;
// 0.9s from the last shot (at t=0.9) to end (at t=1.8): total stays 1.8s.
const POST_LAST_SHOT_COOLDOWN = 0.9;
const SHOT_SPACING = 0.2;
const NUM_SHOTS = 3;
const MAX_DISTANCE = 520;
const BULLET_SPEED = 1400;
const BULLET_DAMAGE = 15;
const INACCURACY_BASE = Math.PI / 64;
const DAMAGE_MODIFIER_MULTIPLIER =
    ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES[CARD_ID] ?? DEFAULT_DAMAGE_MODIFIER_MULTIPLIER;

const PISTOL_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="26" width="28" height="8" rx="2" fill="#c0c0c0" stroke="#a0a0a0" stroke-width="1"/>
  <rect x="24" y="30" width="10" height="14" rx="2" fill="#4a4a4a" stroke="#2c2c2c" stroke-width="1"/>
  <rect x="38" y="28" width="10" height="4" rx="1" fill="#e0e0e0" />
</svg>`;

const TOOLTIP_LINES = [
    'Fire {{NUM_SHOTS}} precise shots dealing {{DAMAGE}} damage each',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    NUM_SHOTS: { kind: 'plain', value: NUM_SHOTS },
    DAMAGE: { kind: 'damage', base: BULLET_DAMAGE },
};

export const PistolAbility: AbilityStatic = defineGunAbility({
    id: CARD_ID,
    name: 'Pistol',
    image: PISTOL_IMAGE,
    resourceCosts: [{ resourceId: 'ammo', amount: 10, allowPartialIfPositive: true }],
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    damageModifierMultiplier: DAMAGE_MODIFIER_MULTIPLIER,
    damage: BULLET_DAMAGE,
    maxDistance: MAX_DISTANCE,
    bulletSpeed: BULLET_SPEED,
    baseInaccuracy: INACCURACY_BASE,
    numShots: NUM_SHOTS,
    shotSpacing: SHOT_SPACING,
    perShotTargets: true,
    targetLabels: ['First shot', 'Second shot', 'Third shot'],
    prefireTime: PREFIRE_FIRST_SHOT,
    cooldownDuration: POST_LAST_SHOT_COOLDOWN,
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, {
                ability: { id: CARD_ID, damageModifierMultiplier: DAMAGE_MODIFIER_MULTIPLIER },
            }),
        );
    },
});

export const PistolCard: CardDef = {
    abilityId: CARD_ID,
};
