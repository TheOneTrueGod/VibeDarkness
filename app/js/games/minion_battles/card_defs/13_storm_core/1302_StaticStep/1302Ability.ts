/**
 * Static Step - the caster becomes a streak of lightning for a moment, darting to a point and leaving
 * a crackling bolt stretched behind them. Enemies they pass through are zapped and left Conductive.
 * It spends a Static and a Movement Point.
 */

import { AbilityEventType } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { createMovementTargetPreview } from '../../../abilities/previewHelpers';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import { nullHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import {
    CONDUCTIVE_MARK_ID,
    STATIC_STEP_ABILITY_ID,
    STATIC_STEP_COLLISION_STEP,
    STATIC_STEP_CONDUCTIVE_STACKS,
    STATIC_STEP_DAMAGE,
    STATIC_STEP_DISTANCE,
    STATIC_STEP_DURATION,
    STATIC_STEP_FIELD_ARCS,
    STATIC_STEP_HIT_RADIUS_SCALE,
    STATIC_STEP_MAX_USES,
    STATIC_STEP_MOVEMENT_COST,
    STATIC_STEP_STATIC_COST,
} from '../stormConstants';
import { spawnStormBolt, spawnStormSpark } from '../stormVfx';
import STATIC_STEP_IMAGE from './staticStep.svg?raw';

const CARD_ID = STATIC_STEP_ABILITY_ID;


/**
 * Arcs riding the caster inside the touch circle for the whole step, so the area that zaps reads as a
 * ball of lightning: each arc joins two points on the circle's edge, spaced evenly around it.
 */
function spawnStaticStepField(eng: EngineContext, caster: Unit): void {
    const r = caster.radius * STATIC_STEP_HIT_RADIUS_SCALE;
    for (let i = 0; i < STATIC_STEP_FIELD_ARCS; i++) {
        const a0 = (i / STATIC_STEP_FIELD_ARCS) * Math.PI * 2;
        const a1 = a0 + Math.PI * 0.85;
        spawnStormBolt(eng, caster, caster, {
            fromUnitId: caster.id,
            toUnitId: caster.id,
            fromOffset: { x: Math.cos(a0) * r, y: Math.sin(a0) * r },
            toOffset: { x: Math.cos(a1) * r, y: Math.sin(a1) * r },
            duration: STATIC_STEP_DURATION + 0.08,
            width: 1.4,
            forks: 1,
            flickerHz: 30,
            maxJitterPx: r * 0.35,
        });
    }
}

const TOOLTIP_LINES = [
    '{Dodge} towards a point, sending static shocks to nearby enemies dealing {{DAMAGE}} damage.',
    `{Conductive ${STATIC_STEP_CONDUCTIVE_STACKS}}`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: STATIC_STEP_DAMAGE },
};

export const StaticStepAbility_1302 = defineAbility({
    id: CARD_ID,
    name: 'Static Step',
    image: STATIC_STEP_IMAGE,
    resourceCost: { resourceId: 'static', amount: STATIC_STEP_STATIC_COST },
    resourceCosts: [
        { resourceId: 'static', amount: STATIC_STEP_STATIC_COST },
        { resourceId: 'movement_points', amount: STATIC_STEP_MOVEMENT_COST },
    ],
    rechargeTurns: 1,
    maxUses: STATIC_STEP_MAX_USES,
    prefireTime: STATIC_STEP_DURATION,
    aiSettings: { minRange: 0, maxRange: STATIC_STEP_DISTANCE },
    abilityTimings: [
        {
            id: 'step',
            start: 0,
            end: STATIC_STEP_DURATION,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: 'Step',
            tags: ['iframe'] as const,
            targetDef: { kind: 'select', label: 'Step to', hitbox: nullHitbox, filter: 'any', allowMiss: true },
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        const eng = ctx.engine as EngineContext;
                        // A bolt pinned where the step began, its far end riding the caster as they streak.
                        spawnStormSpark(eng, ctx.caster, { radius: ctx.caster.radius + 10, count: 7 });
                        spawnStormBolt(eng, ctx.caster, ctx.caster, {
                            toUnitId: ctx.caster.id,
                            duration: STATIC_STEP_DURATION + 0.3,
                            width: 2.5,
                            forks: 3,
                        });
                        spawnStaticStepField(eng, ctx.caster);
                    }),
                },
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.Dash()
                        .withMaxDistance(STATIC_STEP_DISTANCE)
                        .withCollisionStep(STATIC_STEP_COLLISION_STEP)
                        .withConstantSpeed()
                        .withAfterimages(true, 1)
                        .addHitbox('caster', { shape: 'circle', range: 'caster', rangeScale: STATIC_STEP_HIT_RADIUS_SCALE }, {
                            damage: STATIC_STEP_DAMAGE,
                            attackType: 'melee',
                            filter: 'enemy',
                        }),
                },
                {
                    // Arrival flash in the dash's last frames: the ability ends with the dash, like Dodge.
                    timingStart: '95%',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        spawnStormSpark(ctx.engine as EngineContext, ctx.caster, { radius: ctx.caster.radius + 14, count: 8 });
                    }),
                },
            ],
        },
    ],
    targets: [],

    // The dash's touch hitbox fires ON_ATTACK_HIT once per enemy passed through.
    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [{ type: 'applyMarkToPrimaryTarget', markId: CONDUCTIVE_MARK_ID, stacks: STATIC_STEP_CONDUCTIVE_STACKS }],
            },
        ],
    },

    renderTargetingPreviewSelectedTargets: createMovementTargetPreview(STATIC_STEP_DISTANCE, STATIC_STEP_COLLISION_STEP),

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});

export const StaticStepCard_1302: CardDef = {
    abilityId: CARD_ID,
};
