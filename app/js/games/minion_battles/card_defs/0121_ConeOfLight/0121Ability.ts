import type { AbilityRecoveryRule, AbilityStatic } from '../../abilities/Ability';
import { defineConeStrike } from '../../abilities/archetypes/defineConeStrike';
import { resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';
import { type CardDef } from '../types';
import { STANDARD_SHIELD_HALF_ARC_RAD } from '../../abilities/shieldHelpers';

const CARD_ID = '0121';
const MAX_USES = 2;
const STARTING_USES = 0;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 },
];
export const CONE_OF_LIGHT_RANGE = 110;
export const CONE_OF_LIGHT_HALF_ANGLE_RAD = STANDARD_SHIELD_HALF_ARC_RAD / 2;
export const CONE_OF_LIGHT_DAMAGE = 18;
export const CONE_OF_LIGHT_MAX_TARGETS = 6;
export const CONE_OF_LIGHT_STUN_SECONDS = 2;
export const CONE_OF_LIGHT_STUN_CHARGES = 2;
export const CONE_OF_LIGHT_ARC_DEGREES = 60;
export const CONE_OF_LIGHT_FLASH_DURATION = 0.3;
export const CONE_OF_LIGHT_WINDUP_END = 0.2;
export const CONE_OF_LIGHT_ACTIVE_END = 0.3;
export const CONE_OF_LIGHT_COOLDOWN_END = 0.95;
const PREVIEW_FILL_COLOR = 0xa0a0a0;
const PREVIEW_STROKE_COLOR = 0x505050;

const TOOLTIP_LINES = [
    'Release a blinding cone of light',
    'Deals {{DAMAGE}} damage to up to {{MAX_TARGETS}} enemies in a {{ARC_DEGREES}}° arc',
    'Stuns hit enemies for {{STUN}} seconds',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: CONE_OF_LIGHT_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: CONE_OF_LIGHT_MAX_TARGETS },
    ARC_DEGREES: { kind: 'plain', value: CONE_OF_LIGHT_ARC_DEGREES },
    STUN: { kind: 'plain', value: CONE_OF_LIGHT_STUN_SECONDS },
};

const CONE_OF_LIGHT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="col_glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fffde7"/>
      <stop offset="0.5" stop-color="#ffe066"/>
      <stop offset="1" stop-color="#ffd700" stop-opacity="0.3"/>
    </radialGradient>
  </defs>
  <polygon points="32,8 8,56 56,56" fill="url(#col_glow)" stroke="#ffd700" stroke-width="2"/>
  <circle cx="32" cy="14" r="5" fill="#fff9c4"/>
</svg>`;

export const ConeOfLightAbility: AbilityStatic = defineConeStrike({
    id: CARD_ID,
    name: 'Cone of Light',
    image: CONE_OF_LIGHT_IMAGE,
    maxUses: MAX_USES,
    startingUses: STARTING_USES,
    recoveries: RECOVERIES,
    range: CONE_OF_LIGHT_RANGE,
    halfAngleRad: CONE_OF_LIGHT_HALF_ANGLE_RAD,
    damage: CONE_OF_LIGHT_DAMAGE,
    maxTargets: CONE_OF_LIGHT_MAX_TARGETS,
    stunSeconds: CONE_OF_LIGHT_STUN_SECONDS,
    stunCcCharges: CONE_OF_LIGHT_STUN_CHARGES,
    windupEnd: CONE_OF_LIGHT_WINDUP_END,
    activeEnd: CONE_OF_LIGHT_ACTIVE_END,
    cooldownEnd: CONE_OF_LIGHT_COOLDOWN_END,
    flashDuration: CONE_OF_LIGHT_FLASH_DURATION,
    previewFillColor: PREVIEW_FILL_COLOR,
    previewStrokeColor: PREVIEW_STROKE_COLOR,

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const ConeOfLightCard: CardDef = {
    abilityId: CARD_ID,
};
