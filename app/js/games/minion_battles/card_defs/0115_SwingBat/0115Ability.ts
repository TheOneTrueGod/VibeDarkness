/**
 * Swing Bat â€” Warrior melee (pipe bat).
 *
 * Heavy perpendicular swing. Hits up to 3 targets; heavier knockback than the basic stick.
 * Damage boosted by Reinforced Steel research.
 *
 * Timings:
 *   0.00â€“0.20  windup
 *   0.20â€“0.30  hit
 *   0.30â€“1.65  cooldown
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import type { Unit } from '../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import { type CardDef } from '../types';
import { Effect } from '../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS, DEFAULT_MELEE_LUNGE } from '../../game/units/unit_defs/unitConstants';
import { setupWindupLungePayload } from '../../abilities/WindupLunge';
import { perpendicularSwingHitbox, ThickLineHitbox } from '../../hitboxes';
import { isSinglePlayerBattle } from '../../abilities/singlePlayerBattle';
import {
    createChargeUpConfig,
    spawnRadiusScaledChargeUp,
    type MeleeAnimationProfile,
} from '../../abilities/meleeAnimationProfile';
import { renderMeleeTrackingHighlights } from '../../abilities/targeting';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import { hasResearchNode, resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';
import {
    STICK_SWORD_TREE_ID,
    STICK_SWORD_NODE_PIPE_BAT_DAMAGE,
} from '../../../../researchTrees/trees/stick_sword';
import { getApproxIntegerIncrease, DescriptiveValue } from '../../../../researchTrees/descriptiveValue';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}15`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 25;
export const SWING_BAT_BASE_DAMAGE = 10;
const BASE_DAMAGE = SWING_BAT_BASE_DAMAGE;
const DAMAGE_RESEARCH_BONUS = getApproxIntegerIncrease(BASE_DAMAGE, DescriptiveValue.Medium);
const SWING_BAT_EFFECT_DURATION = 0.4;
const MAX_TARGETS = 3;
const KNOCKBACK_TIER = 3;
const LINE_THICKNESS = 26;
const SWING_LENGTH = 80;

const SWING_BAT_HITBOX = perpendicularSwingHitbox(BASE_MAX_RANGE, SWING_LENGTH, LINE_THICKNESS, MAX_TARGETS);

const SWING_BAT_PROFILE: MeleeAnimationProfile = {
    chargeUp: createChargeUpConfig('high', {
        startTime: 0.04,
        endTime: 0.1,
        radius: DEFAULT_UNIT_RADIUS,
        color: 0x8a6a3a,
    }),
};

function hasPipeBatDamageResearch(gameState: unknown, caster?: Unit): boolean {
    const eng = gameState as AbilityEngineContext | undefined;
    if (hasResearchNode(eng, caster, STICK_SWORD_TREE_ID, STICK_SWORD_NODE_PIPE_BAT_DAMAGE)) {
        return true;
    }
    const trees = (gameState as { researchTrees?: Record<string, string[]> } | undefined)?.researchTrees;
    return trees?.[STICK_SWORD_TREE_ID]?.includes(STICK_SWORD_NODE_PIPE_BAT_DAMAGE) ?? false;
}

function getDamage(engine: AbilityEngineContext | undefined, caster: Unit | undefined): number {
    return hasPipeBatDamageResearch(engine, caster)
        ? BASE_DAMAGE + DAMAGE_RESEARCH_BONUS
        : BASE_DAMAGE;
}

/** Ability-specific base for tooltips (Reinforced Steel), before global Training/Mighty. */
function getTooltipBaseDamage(gameState?: unknown): number {
    return hasPipeBatDamageResearch(gameState)
        ? BASE_DAMAGE + DAMAGE_RESEARCH_BONUS
        : BASE_DAMAGE;
}

const TOOLTIP_LINES = [
    'Swing your pipe bat dealing {{DAMAGE}} damage to up to {{MAX_TARGETS}} enemies.',
    '{{KNOCKBACK}}.',
] as const;

const SWING_BAT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="28" width="44" height="12" rx="3" fill="#6b6b7a" stroke="#4a4a58" stroke-width="2"/>
  <rect x="28" y="8" width="8" height="24" rx="2" fill="#7c7c8c" stroke="#4a4a58" stroke-width="1.5"/>
  <rect x="10" y="28" width="20" height="12" rx="3" fill="#5a5a68" opacity="0.6"/>
  <circle cx="52" cy="34" r="5" fill="#4a4a58" stroke="#333344" stroke-width="1.5"/>
</svg>`;

// ---- Behaviour ----

const swingBatBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(SWING_BAT_HITBOX)
    .withSlide({ forwardDistance: 18, backwardDistance: 0 })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const ep = SWING_BAT_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(new Effect({
            x: ep.rightX,
            y: ep.rightY,
            startX: ep.leftX,
            startY: ep.leftY,
            duration: SWING_BAT_EFFECT_DURATION,
            effectType: 'punch',
        }));
    })
    .withDamage((ctx, unit) => {
        const eng = ctx.engine as AbilityEngineContext;
        const baseDmg = getDamage(eng, ctx.caster);
        if (isSinglePlayerBattle(eng.units) && unit.characterId === 'dark_wolf') {
            return Math.max(baseDmg, unit.maxHp);
        }
        return baseDmg;
    })
    .withKnockback(KNOCKBACK_TIER);

// ---- Timings ----

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,    end: 0.2,  abilityPhase: AbilityPhase.Windup },
    { id: 'hit',      start: 0.2,  end: 0.3,  abilityPhase: AbilityPhase.Active, doNotRefund: true,
      targetDef: { kind: 'select', label: 'Target', hitbox: SWING_BAT_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: swingBatBehaviour },
    { id: 'cooldown', start: 0.3,  end: 1.65, abilityPhase: AbilityPhase.Cooldown },
];

// ---- Ability export ----

export const SwingBatAbility_0115: AbilityStatic = {
    id: CARD_ID,
    name: 'Swing Bat',
    image: SWING_BAT_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0.2,
    abilityTimings: ABILITY_TIMINGS,
    targets: [],
    aiSettings: { minRange: BASE_MIN_RANGE, maxRange: SWING_BAT_HITBOX.maxRange + DEFAULT_MELEE_LUNGE },
    lunge: { distance: DEFAULT_MELEE_LUNGE },

    getTooltipText(gameState?: unknown): string[] {
        const bindings: TooltipTokenBindings = {
            DAMAGE: { kind: 'damage', base: getTooltipBaseDamage(gameState) },
            MAX_TARGETS: { kind: 'plain', value: MAX_TARGETS },
            KNOCKBACK: { kind: 'knockback', tier: KNOCKBACK_TIER },
        };
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            bindings,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: BASE_MIN_RANGE, maxRange: SWING_BAT_HITBOX.maxRange + DEFAULT_MELEE_LUNGE };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < 0.2) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        setupWindupLungePayload(engine, caster, targets, active, { distance: DEFAULT_MELEE_LUNGE }, SWING_BAT_HITBOX.maxRange);
        spawnRadiusScaledChargeUp(engine as { addEffect(effect: Effect): void }, caster, SWING_BAT_PROFILE);
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): void {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const aimDirX = dist > 0 ? dx / dist : 1;
        const aimDirY = dist > 0 ? dy / dist : 0;
        const clampedDist = Math.min(SWING_BAT_HITBOX.maxRange, dist || SWING_BAT_HITBOX.maxRange);
        const centerX = caster.x + aimDirX * clampedDist;
        const centerY = caster.y + aimDirY * clampedDist;
        const half = SWING_LENGTH / 2;
        const perpX = -aimDirY * half;
        const perpY = aimDirX * half;
        const leftX = centerX - perpX;
        const leftY = centerY - perpY;
        const rightX = centerX + perpX;
        const rightY = centerY + perpY;
        const halfThick = LINE_THICKNESS / 2;
        const offX = aimDirX * halfThick;
        const offY = aimDirY * halfThick;

        gr.clear();
        gr.moveTo(leftX + offX, leftY + offY);
        gr.lineTo(leftX - offX, leftY - offY);
        gr.lineTo(rightX - offX, rightY - offY);
        gr.lineTo(rightX + offX, rightY + offY);
        gr.lineTo(leftX + offX, leftY + offY);
        gr.fill({ color: 0x9ca3af, alpha: 0.5 });
        gr.stroke({ color: 0x505060, width: 2, alpha: 0.9 });

        const ctx = { units, getUnit: (id: string) => units.find((u) => u.id === id) };
        const hits = ThickLineHitbox.getUnitsInHitbox(ctx, caster, leftX, leftY, rightX, rightY, LINE_THICKNESS);
        if (hits.length > 0) {
            hits.sort((a, b) => {
                const da = (a.x - mouseWorld.x) ** 2 + (a.y - mouseWorld.y) ** 2;
                const db = (b.x - mouseWorld.x) ** 2 + (b.y - mouseWorld.y) ** 2;
                return da - db;
            });
            renderMeleeTrackingHighlights(gr, hits.slice(0, MAX_TARGETS));
        }
    },
};

export const SwingBatCard: CardDef = {
    abilityId: CARD_ID,
};
