/**
 * Collapse (0905) — single-click cone gather.
 *
 * Windup shows a violet cone that tightens inward. On release the enemies nearest the cursor inside the
 * cone (up to COLLAPSE_MAX_TARGETS) are pulled into an arc in front of the caster, take flat damage and
 * are briefly Staggered. The cast ends COLLAPSE_FOLLOW_UP_OVERLAP before the pulled enemies land.
 *
 * Reusable pieces: `selectNearestToPointInCone` / `computeArcLandingSlots` (abilities/gatherHelpers),
 * aimed knockback with `durationOverride`, `tryApplyStagger`, and the ConeCollapse / TetherRibbon effects.
 */

import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { computeArcLandingSlots, selectNearestToPointInCone } from '../../../abilities/gatherHelpers';
import { drawConeSlice } from '../../../abilities/previewHelpers';
import { getDirectionFromTo } from '../../../abilities/targetHelpers';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { knockbackCtxFromEngine, tryApplyAimedKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import { tryApplyStagger } from '../../../crowdControl/tryApplyStagger';
import { GRAVITY_VIOLET } from '../../../game/effect_defs/aoeEffects';
import {
    CONE_COLLAPSE_EFFECT_TYPE,
    drawConvergeStreams,
    FLING_TRAIL_EFFECT_TYPE,
    TETHER_RIBBON_EFFECT_TYPE,
} from '../../../game/effect_defs/collapseEffects';
import { TERRAIN_IMPACT_EFFECT_TYPE } from '../../../game/effect_defs/impactEffects';
import { Effect } from '../../../game/effects/Effect';
import type { EngineContext } from '../../../game/EngineContext';
import type { ActiveAbility } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import type { KnockbackSource } from '../../../game/units/unitTypes';
import type { HitboxPreviewCaster } from '../../../hitboxes/Hitbox';
import { TruncatedConeHitboxSpec } from '../../../hitboxes/TruncatedConeHitbox';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import {
    COLLAPSE_ARC_SPACING,
    COLLAPSE_ARC_SPREAD_DEG,
    COLLAPSE_CONE_LENGTH,
    COLLAPSE_CONE_WIDTH_DEG,
    COLLAPSE_COOLDOWN_DURATION,
    COLLAPSE_DAMAGE,
    COLLAPSE_FLING_DURATION,
    COLLAPSE_GRAVITY_COST,
    COLLAPSE_KNOCKBACK_TIER,
    COLLAPSE_LANDING_MAX_DISTANCE,
    COLLAPSE_LANDING_MIN_DISTANCE,
    COLLAPSE_MAX_TARGETS,
    COLLAPSE_MAX_USES,
    COLLAPSE_PREFIRE_TIME,
    COLLAPSE_RELEASE_DURATION,
    COLLAPSE_STAGGER_LINGER,
    COLLAPSE_TARGET_LABEL,
} from '../gravityConstants';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}05`;
const HOWL_SHOCKWAVE_EFFECT_TYPE = 'HowlShockwave';
const ARRIVAL_SHOCKWAVE_COLORS = [GRAVITY_VIOLET, GRAVITY_VIOLET, GRAVITY_VIOLET];
const ARRIVAL_SHOCKWAVE_SCALE = 0.35;
const ARRIVAL_EFFECT_DURATION = 0.35;
const RELEASE_EFFECT_DURATION = 0.2;
const COLLAPSE_HALF_ARC_RAD = ((COLLAPSE_CONE_WIDTH_DEG / 2) * Math.PI) / 180;
const RELEASE_START = COLLAPSE_PREFIRE_TIME;
const RELEASE_END = RELEASE_START + COLLAPSE_RELEASE_DURATION;
const COOLDOWN_END = RELEASE_END + COLLAPSE_COOLDOWN_DURATION;

const TOOLTIP_LINES = [
    'Crush a cone inward, pulling up to {{MAX_TARGETS}} enemies nearest your cursor into an arc in front of you.',
    'Deals {{DAMAGE}} damage and briefly staggers them.',
    '{knockback 3}',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    MAX_TARGETS: { kind: 'plain', value: COLLAPSE_MAX_TARGETS },
    DAMAGE: { kind: 'damage', base: COLLAPSE_DAMAGE },
};

const COLLAPSE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 12 L56 28 L56 36 L8 52 Z" fill="#1e1033" stroke="#a855f7" stroke-width="2" opacity="0.85"/>
  <path d="M14 20 L44 30 M14 44 L44 34" stroke="#c084fc" stroke-width="2" stroke-linecap="round"/>
  <circle cx="50" cy="32" r="7" fill="#a855f7" stroke="#c084fc" stroke-width="2"/>
</svg>`;

/** Cone targeting preview in Gravity violet (same geometry the release uses). */
class CollapseConeHitbox extends TruncatedConeHitboxSpec {
    constructor() {
        super(COLLAPSE_CONE_LENGTH, COLLAPSE_HALF_ARC_RAD, () => 0, COLLAPSE_MAX_TARGETS);
    }

    override renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const inCone = super.renderTargetingPreview(gr, caster, mouseWorld, units, {
            fillColor: GRAVITY_VIOLET,
            fillAlpha: 0.14,
            strokeColor: GRAVITY_VIOLET,
            strokeAlpha: 0.5,
        });
        // Highlight only the units the release would pull: nearest the cursor, same tie-break as the selection.
        return [...inCone]
            .sort(
                (a, b) =>
                    (a.x - mouseWorld.x) ** 2 + (a.y - mouseWorld.y) ** 2 -
                        ((b.x - mouseWorld.x) ** 2 + (b.y - mouseWorld.y) ** 2) ||
                    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
            )
            .slice(0, COLLAPSE_MAX_TARGETS);
    }
}

const COLLAPSE_HITBOX = new CollapseConeHitbox();

function spawnReleaseEffects(
    engine: EngineContext,
    caster: Unit,
    aim: { x: number; y: number },
): void {
    const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, aim.x, aim.y);
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: RELEASE_EFFECT_DURATION,
        effectType: CONE_COLLAPSE_EFFECT_TYPE,
        effectData: {
            color: GRAVITY_VIOLET,
            length: COLLAPSE_CONE_LENGTH,
            widthDeg: COLLAPSE_CONE_WIDTH_DEG,
            direction: Math.atan2(dirY, dirX),
        },
    }));
}

function spawnTetherEffect(
    engine: EngineContext,
    from: { x: number; y: number },
    to: { x: number; y: number },
): void {
    engine.addEffect(new Effect({
        x: from.x,
        y: from.y,
        duration: RELEASE_EFFECT_DURATION,
        effectType: TETHER_RIBBON_EFFECT_TYPE,
        effectData: { color: GRAVITY_VIOLET, from, to },
    }));
}

/** Violet streak chasing the flung enemy for the fling duration (no camera involvement). */
function spawnFlingTrail(
    engine: EngineContext,
    from: { x: number; y: number },
    to: { x: number; y: number },
): void {
    engine.addEffect(new Effect({
        x: from.x,
        y: from.y,
        duration: COLLAPSE_FLING_DURATION,
        effectType: FLING_TRAIL_EFFECT_TYPE,
        effectData: { color: GRAVITY_VIOLET, from, to },
    }));
}

/** Arrival ring + dust at a landing slot, delayed so they appear when the enemy lands. */
function spawnArrivalEffects(engine: EngineContext, slot: { x: number; y: number }): void {
    engine.addEffect(new Effect({
        x: slot.x,
        y: slot.y,
        duration: ARRIVAL_EFFECT_DURATION,
        delay: COLLAPSE_FLING_DURATION,
        effectType: HOWL_SHOCKWAVE_EFFECT_TYPE,
        effectData: { colors: [...ARRIVAL_SHOCKWAVE_COLORS], scale: ARRIVAL_SHOCKWAVE_SCALE },
    }));
    engine.addEffect(new Effect({
        x: slot.x,
        y: slot.y,
        duration: ARRIVAL_EFFECT_DURATION,
        delay: COLLAPSE_FLING_DURATION,
        effectType: TERRAIN_IMPACT_EFFECT_TYPE,
        effectData: { color: GRAVITY_VIOLET, impact: { x: slot.x, y: slot.y } },
    }));
}

/**
 * Select the enemies nearest the cursor in the cone, pull each into its arc slot, damage and stagger.
 * Slot spacing uses the largest selected target's radius so differently sized units do not overlap.
 */
function releaseCollapse(engine: EngineContext, caster: Unit, aim: { x: number; y: number }, abilityId: string): void {
    spawnReleaseEffects(engine, caster, aim);

    const targets = selectNearestToPointInCone({
        caster,
        units: engine.units,
        aim,
        cursor: aim,
        length: COLLAPSE_CONE_LENGTH,
        widthDeg: COLLAPSE_CONE_WIDTH_DEG,
        maxTargets: COLLAPSE_MAX_TARGETS,
        gameTime: engine.gameTime,
    });
    if (targets.length === 0) return;

    const slots = computeArcLandingSlots({
        caster,
        aim,
        count: targets.length,
        radiusFromEdge: COLLAPSE_ARC_SPACING,
        spreadDeg: COLLAPSE_ARC_SPREAD_DEG,
        targetRadius: Math.max(...targets.map((t) => t.radius)),
    });

    const knockbackEngine = knockbackCtxFromEngine(engine);
    const source: KnockbackSource = { unitId: caster.id, abilityId };

    targets.forEach((target, i) => {
        const slot = slots[i];
        const from = { x: target.x, y: target.y };
        const result = tryApplyAimedKnockbackByTier(
            target,
            COLLAPSE_KNOCKBACK_TIER,
            slot,
            source,
            knockbackEngine,
            {
                landingMinDistance: COLLAPSE_LANDING_MIN_DISTANCE,
                landingMaxDistance: COLLAPSE_LANDING_MAX_DISTANCE,
                distanceScale: 1,
                durationOverride: COLLAPSE_FLING_DURATION,
            },
            // Gather, not a collision attack: pulled enemies pass through each other (Force Push owns collision damage).
            { collideWithUnits: false },
        );
        // Juggernaut/structure/iFrames fully resist the pull: no damage, no stagger.
        if (result.outcome === 'fully_resisted') return;

        target.takeDamage(COLLAPSE_DAMAGE, caster.id, engine.eventBus);
        tryApplyStagger(
            target,
            COLLAPSE_FLING_DURATION + COLLAPSE_STAGGER_LINGER,
            knockbackEngine,
        );
        spawnTetherEffect(engine, from, slot);
        spawnFlingTrail(engine, from, slot);
        spawnArrivalEffects(engine, slot);
    });
}

export const CollapseAbility = defineAbility({
    id: CARD_ID,
    name: 'Collapse',
    image: COLLAPSE_IMAGE,
    resourceCost: { resourceId: 'gravity', amount: COLLAPSE_GRAVITY_COST },
    rechargeTurns: 1,
    maxUses: COLLAPSE_MAX_USES,
    // All uses return each round (recovery is clamped to maxUses).
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: COLLAPSE_MAX_USES }],
    prefireTime: COLLAPSE_PREFIRE_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: RELEASE_START, abilityPhase: AbilityPhase.Windup },
        {
            id: 'release',
            start: RELEASE_START,
            end: RELEASE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: COLLAPSE_TARGET_LABEL,
                hitbox: COLLAPSE_HITBOX,
                filter: 'enemy',
                allowMiss: true,
            },
            behaviour: CastBehaviours.Instant((ctx) => {
                const eng = ctx.engine as EngineContext;
                const aim = resolveTargetToPoint(ctx.target, eng);
                if (!aim) return;
                releaseCollapse(eng, ctx.caster, aim, ctx.abilityId);
            }),
        },
        { id: 'cooldown', start: RELEASE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: COLLAPSE_CONE_LENGTH },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: COLLAPSE_CONE_LENGTH };
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },

    /** Windup telegraph: the violet cone tightens (shrinking reach and width) until release. */
    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= RELEASE_START) return;
        const target = activeAbility.targets[0];
        if (!target || target.type !== 'pixel' || !target.position) return;
        const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, target.position.x, target.position.y);
        const t = Math.max(0, Math.min(1, elapsed / RELEASE_START));
        const shrink = 1 - 0.55 * t;
        drawConvergeStreams(gr, {
            originX: caster.x,
            originY: caster.y,
            color: GRAVITY_VIOLET,
            length: COLLAPSE_CONE_LENGTH,
            widthDeg: COLLAPSE_CONE_WIDTH_DEG * 0.9,
            direction: Math.atan2(dirY, dirX),
            progress: t,
            seed: activeAbility.startTime,
        });
        drawConeSlice(
            gr,
            caster.x,
            caster.y,
            Math.atan2(dirY, dirX),
            COLLAPSE_HALF_ARC_RAD * shrink,
            0,
            COLLAPSE_CONE_LENGTH * shrink,
            {
                fillColor: GRAVITY_VIOLET,
                fillAlpha: 0.1 + 0.2 * t,
                strokeColor: GRAVITY_VIOLET,
                strokeAlpha: 0.35 + 0.4 * t,
            },
        );
    },
});

export const CollapseCard: CardDef = {
    abilityId: CARD_ID,
};
