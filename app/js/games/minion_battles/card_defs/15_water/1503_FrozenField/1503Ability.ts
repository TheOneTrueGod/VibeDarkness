/**
 * Frozen Field - Blood Burst (0302) frozen solid: a long, committed cast for a big area. The Water spell
 * circle gathers for 0.8 s, then the target is picked (0.2 s before the hit) while ice rises across the
 * field; at 1.0 s a rectangle of ice lands centred on the target, aimed along caster -> target. It deals
 * impact damage and stuns every enemy inside, then lies on the ground for 3 s, hurting and re-stunning
 * enemies on it every 0.5 s. It holds Blood Burst's bar slot while the caster can pay for it, and its mode
 * strip still casts Blood Burst from the slot.
 *
 * Built from engine blocks: `SpellCircle` (water style), `orientedRectAtPointHitbox` (one geometry for the
 * pick, the hit, the rising ice and the ground cells), `landAreaStrike`, the `SpikesRise` effect, and
 * `GroundPatch` with `cells` placing the `frozen_field` standing hazard (team-aware damage + stun).
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { defineAbility } from '../../../abilities/defineAbility';
import { landAreaStrike } from '../../../abilities/areaStrike';
import { getModifiedAbilityDamage } from '../../../abilities/damageModifiers';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { findMeleeAimPixelInTargets, resolveTargetToPoint } from '../../../abilities/targeting';
import { themedTelegraphStyle } from '../../../abilities/telegraphStyles';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { orientedRectAtPointHitbox, type OrientedRect } from '../../../hitboxes/OrientedRectHitbox';
import type { HitboxEngineContext } from '../../../hitboxes/Hitbox';
import { SPELL_CIRCLE_STYLE_WATER } from '../../../game/spellCircles/spellCircles';
import { createSpikesRise, type SpikesRiseStyle } from '../../../game/effects/spikesRise';
import { hashMoteSeed, MOTE_PRESETS, moteBurst, moteRng } from '../../../game/effects/motes';
import {
    FROZEN_FIELD_DAMAGE,
    FROZEN_FIELD_EFFECT_TYPE,
    FROZEN_FIELD_INTERVAL_SEC,
    FROZEN_FIELD_STUN_SEC,
    STANDING_DAMAGE_PARAM,
} from '../../../game/terrainEffects/terrainEffectDefs';
import { ResourceId } from '../../../resources/resourceIds';
import { getThemeById } from '../../../themes/abilityTheme';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import { BURST_MAX_USES, BurstAbility_0302 } from '../../03_blood_mage/0302_Burst/0302Ability';
import frozenFieldSvg from './frozenField.svg?raw';

const CARD_ID = `${formatGroupId(AbilityGroupId.Water)}03`;

/** All of a full Water bar (max 16). */
export const FROZEN_FIELD_WATER_COST = 16;
/** Same uses (and round refill) as Blood Burst; the swap also needs a use left. */
export const FROZEN_FIELD_MAX_USES = BURST_MAX_USES;
/** Extent along caster -> target (px). */
export const FROZEN_FIELD_LENGTH = 160;
/** Extent across it (px). */
export const FROZEN_FIELD_WIDTH = 120;
/** Farthest the field's centre may sit from the caster (px). */
export const FROZEN_FIELD_RANGE = 140;
export const FROZEN_FIELD_IMPACT_DAMAGE = 10;
/** Stun from the impact; each pulse of the ice re-applies `FROZEN_FIELD_STUN_SEC` (the same 0.6 s). */
export const FROZEN_FIELD_IMPACT_STUN_SEC = FROZEN_FIELD_STUN_SEC;
export const FROZEN_FIELD_PULSE_DAMAGE = FROZEN_FIELD_DAMAGE;
export const FROZEN_FIELD_PULSE_EVERY_SEC = FROZEN_FIELD_INTERVAL_SEC;
/** How long the ice lies on the ground after the impact. */
export const FROZEN_FIELD_LIFETIME_SEC = 3;

/** Cast timeline (seconds): windup with the spell circle, the late pick + rising ice, impact, cooldown. */
export const FROZEN_FIELD_TIMINGS = {
    selectAt: 0.8,
    impactAt: 1.0,
    impactEnd: 1.1,
    cooldownEnd: 1.8,
} as const;

/** Mode ids on the card's mode strip. */
export const FROZEN_FIELD_MODE = 'frozen';
export const FROZEN_FIELD_BLOOD_MODE = 'blood';
export const FROZEN_FIELD_TARGET_LABEL = 'Field centre';

const WATER = getThemeById('water');
/** How long the rising ice stays up (from the pick): up by the impact, fading once the field has landed. */
const SPIKES_RISE_SECONDS = 1.2;
const ICE_CHIPS_PER_HIT = 6;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: FROZEN_FIELD_MAX_USES },
];

/**
 * The field: one oriented rectangle for the pick preview, the impact hit, the rising ice and the ground
 * cells. Tidewater telegraph (seafoam outline over the theme's ground-telegraph widths), as the artbook marks
 * the pick.
 */
export const FROZEN_FIELD_HITBOX = orientedRectAtPointHitbox({
    length: FROZEN_FIELD_LENGTH,
    width: FROZEN_FIELD_WIDTH,
    maxRange: FROZEN_FIELD_RANGE,
    style: { ...themedTelegraphStyle(CARD_ID), color: WATER.secondaryNum },
});

const SPIKES_STYLE: SpikesRiseStyle = {
    color: WATER.secondaryNum,
    edgeColor: WATER.shadeNum,
    highlightColor: 0xffffff,
};

/** The picked aim pixel (the trailing select pixel), else the target point, else the caster. */
export function frozenFieldAim(ctx: Pick<CastBehaviourTickContext, 'allTargets' | 'target' | 'engine' | 'caster'>): { x: number; y: number } {
    return findMeleeAimPixelInTargets(ctx.allTargets)
        ?? (ctx.target ? resolveTargetToPoint(ctx.target, ctx.engine) : null)
        ?? { x: ctx.caster.x, y: ctx.caster.y };
}

function fieldRect(ctx: CastBehaviourTickContext): OrientedRect {
    return FROZEN_FIELD_HITBOX.getRect(ctx.caster, frozenFieldAim(ctx));
}

function castSeed(ctx: CastBehaviourTickContext, tag: string): number {
    return hashMoteSeed(`${ctx.caster.id}:${ctx.abilityId}:${ctx.engine.gameTick}:${tag}`);
}

/** Intro (at the pick): ice rises across the field. Render-only. */
const riseIce = CastBehaviours.Instant((ctx) => {
    ctx.engine.addEffect(createSpikesRise({
        rect: fieldRect(ctx),
        seconds: SPIKES_RISE_SECONDS,
        style: SPIKES_STYLE,
        seed: castSeed(ctx, 'rise') % 1000,
        // All up within the 0.2 s before the impact.
        staggerShare: 0.1,
        riseShare: 0.06,
        fadeShare: 0.3,
    }));
});

/** Impact: damage and a stun to every enemy in the field (blockable, through the CC armour gate). */
const impact = CastBehaviours.Instant((ctx) => {
    const rect = fieldRect(ctx);
    const aim = frozenFieldAim(ctx);
    const hits = FROZEN_FIELD_HITBOX.resolveHits(ctx.engine as unknown as HitboxEngineContext, ctx.caster, aim.x, aim.y);
    const origin = { x: rect.centerX, y: rect.centerY };
    const rand = moteRng(castSeed(ctx, 'impact'));
    for (const unit of hits) {
        const landed = landAreaStrike(ctx.engine, ctx.caster, ctx.abilityId, origin, unit, {
            damage: FROZEN_FIELD_IMPACT_DAMAGE,
            stunSeconds: FROZEN_FIELD_IMPACT_STUN_SEC,
        });
        if (landed) {
            for (const mote of moteBurst(unit.x, unit.y, MOTE_PRESETS.iceShards(WATER.id), ICE_CHIPS_PER_HIT, rand, unit.radius)) {
                ctx.engine.addEffect(mote);
            }
        }
    }
});

/** The ice that stays: `frozen_field` on every cell whose centre is inside the rectangle. */
const lay = CastBehaviours.GroundPatch({
    effectType: FROZEN_FIELD_EFFECT_TYPE,
    center: (ctx) => {
        const rect = fieldRect(ctx);
        return { x: rect.centerX, y: rect.centerY };
    },
    cells: (ctx) => FROZEN_FIELD_HITBOX.resolveCells(ctx.caster, frozenFieldAim(ctx)),
    // Only shapes the (zero) jitter; the half diagonal keeps it positive.
    radius: Math.hypot(FROZEN_FIELD_LENGTH, FROZEN_FIELD_WIDTH) / 2,
    lifetimeSec: FROZEN_FIELD_LIFETIME_SEC,
    jitterSec: 0,
    // The hazard's per-pulse damage, scaled by the caster's damage modifiers like the impact.
    params: (ctx) => ({
        [STANDING_DAMAGE_PARAM]: getModifiedAbilityDamage(ctx.caster, FROZEN_FIELD_PULSE_DAMAGE),
    }),
    idPrefix: 'frozen-field',
});

const T = FROZEN_FIELD_TIMINGS;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: T.selectAt,
        abilityPhase: AbilityPhase.Windup,
        castBehaviours: [
            { timingStart: 'start', timingEnd: 'end', behaviour: CastBehaviours.SpellCircle({ style: SPELL_CIRCLE_STYLE_WATER }) },
        ],
    },
    {
        id: 'select',
        start: T.selectAt,
        end: T.impactAt,
        abilityPhase: AbilityPhase.Active,
        targetDef: {
            kind: 'select',
            label: FROZEN_FIELD_TARGET_LABEL,
            hitbox: FROZEN_FIELD_HITBOX,
            filter: 'enemy',
            allowMiss: true,
            // Picked 0.2 s before the hit, not before the cast.
            pickAtEntry: true,
            lockOnMode: 'strictHitbox',
        },
        castBehaviours: [{ timingStart: 'start', behaviour: riseIce }],
    },
    {
        id: 'impact',
        start: T.impactAt,
        end: T.impactEnd,
        abilityPhase: AbilityPhase.Active,
        // Interrupted before the impact refunds the Water and the use.
        doNotRefund: true,
        castBehaviours: [
            { timingStart: 'start', behaviour: impact },
            { timingStart: 'start', behaviour: lay },
        ],
    },
    { id: 'cooldown', start: T.impactEnd, end: T.cooldownEnd, abilityPhase: AbilityPhase.Cooldown },
];

const TOOLTIP_LINES = [
    'Freeze the ground ahead: deal {{DAMAGE}} damage to enemies in the field and stun them for {{STUN}}s.',
    'The ice lasts {{LIFETIME}}s, dealing {{PULSE_DAMAGE}} damage every {{EVERY}}s and stunning enemies on it again.',
    "Takes Blood Burst's slot while you can pay for it.",
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: FROZEN_FIELD_IMPACT_DAMAGE },
    STUN: { kind: 'plain', value: FROZEN_FIELD_IMPACT_STUN_SEC },
    LIFETIME: { kind: 'plain', value: FROZEN_FIELD_LIFETIME_SEC },
    PULSE_DAMAGE: { kind: 'damage', base: FROZEN_FIELD_PULSE_DAMAGE },
    EVERY: { kind: 'plain', value: FROZEN_FIELD_PULSE_EVERY_SEC },
};

export const FrozenFieldAbility_1503 = defineAbility({
    id: CARD_ID,
    name: 'Frozen Field',
    image: frozenFieldSvg,
    flavorText: 'Everything stands still on the ice. Everything.',
    // Spent as the cast starts; refunded if interrupted before the impact (its `doNotRefund`).
    resourceCost: { resourceId: ResourceId.Water, amount: FROZEN_FIELD_WATER_COST },
    rechargeTurns: 1,
    maxUses: FROZEN_FIELD_MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: T.impactAt,
    aiSettings: { minRange: 0, maxRange: FROZEN_FIELD_RANGE },
    abilityTimings: ABILITY_TIMINGS,
    targets: [],
    swapConfig: {
        activateTrigger: { type: 'whileCastable' },
        deactivateTrigger: { type: 'whileCastable' },
        replacesAbilityId: BurstAbility_0302.id,
    },
    abilityModes: {
        modes: [FROZEN_FIELD_MODE, FROZEN_FIELD_BLOOD_MODE],
        defaultMode: FROZEN_FIELD_MODE,
        modeAbilityIds: { [FROZEN_FIELD_BLOOD_MODE]: BurstAbility_0302.id },
        modeLabels: { [FROZEN_FIELD_MODE]: 'Frozen Field', [FROZEN_FIELD_BLOOD_MODE]: 'Blood Burst' },
        modeDescriptions: {
            [FROZEN_FIELD_MODE]: 'Freeze a field of ice that stuns the enemies on it',
            [FROZEN_FIELD_BLOOD_MODE]: 'Cast Blood Burst instead, paying HP',
        },
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const FrozenFieldCard_1503: CardDef = {
    abilityId: CARD_ID,
};
