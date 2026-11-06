/**
 * Thunderclap - the caster lets their charge go in one deafening burst. Charge gathers in a tightening
 * ring, then a storm-blue shockwave and a fan of bolts throw nearby enemies back. A Conductive enemy
 * caught takes the heavier hit and gives up a stack, which flows back to the caster as Static; any other
 * enemy is left Conductive. The flash always lights the same Bright light around the caster.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { spawnBrightLight, type EngineWithLight } from '../../../abilities/brightKeyword';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { createMovementPenaltyStates } from '../../../abilities/shieldHelpers';
import { applyMark, spendMarkStacks } from '../../../buffs/MarkBuff';
import { tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import type { EngineContext } from '../../../game/EngineContext';
import { CircleHitbox, ringHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import {
    CONDUCTIVE_MARK_ID,
    STORM_SECONDARY,
    THUNDERCLAP_ABILITY_ID,
    THUNDERCLAP_BRIGHT,
    THUNDERCLAP_CONDUCTIVE_BONUS_DAMAGE,
    THUNDERCLAP_CONDUCTIVE_STACKS,
    THUNDERCLAP_CONDUCTIVE_SPENT_PER_ENEMY,
    THUNDERCLAP_COOLDOWN,
    THUNDERCLAP_DAMAGE,
    THUNDERCLAP_KNOCKBACK_TIER,
    THUNDERCLAP_MAX_TARGETS,
    THUNDERCLAP_RADIUS,
    THUNDERCLAP_STATIC_COST,
    THUNDERCLAP_STATIC_PER_CHARGE,
    THUNDERCLAP_WINDUP,
} from '../stormConstants';
import { spawnStormBolt, spawnStormRing, spawnStormSpark } from '../stormVfx';
import THUNDERCLAP_IMAGE from './thunderclap.svg?raw';

const CARD_ID = THUNDERCLAP_ABILITY_ID;
const ACTIVE_END = THUNDERCLAP_WINDUP + 0.05;
const COOLDOWN_END = ACTIVE_END + THUNDERCLAP_COOLDOWN;
/** Radial bolts thrown out by the clap (visual only). */
const RADIAL_BOLTS = 8;

/** Confirmation targeter: the clap's area is fixed on the caster, but it hits others, so the player confirms it. */
const THUNDERCLAP_HITBOX = ringHitbox({
    innerRadius: 0,
    outerRadius: THUNDERCLAP_RADIUS,
    numTargets: THUNDERCLAP_MAX_TARGETS,
    previewStyle: {
        color: STORM_SECONDARY,
        lineWidth: 2,
        lineAlpha: 0.7,
        fillAlpha: 0.12,
        strokeAlpha: 0.7,
        showCrosshair: false,
    },
});

const clap = CastBehaviours.Instant((ctx) => {
    const eng = ctx.engine as EngineContext;
    const caster = ctx.caster;

    spawnStormRing(eng, caster, THUNDERCLAP_RADIUS, 'expand', 0.35);
    spawnStormSpark(eng, caster, { radius: caster.radius + 18, count: 10 });
    for (let i = 0; i < RADIAL_BOLTS; i++) {
        const angle = (i / RADIAL_BOLTS) * Math.PI * 2;
        const reach = THUNDERCLAP_RADIUS * (i % 2 === 0 ? 1 : 0.75);
        spawnStormBolt(
            eng,
            { x: caster.x + Math.cos(angle) * caster.radius, y: caster.y + Math.sin(angle) * caster.radius },
            { x: caster.x + Math.cos(angle) * reach, y: caster.y + Math.sin(angle) * reach },
            { duration: 0.28, width: 1.8, forks: 1, delay: (i % 2) * 0.03 },
        );
    }

    const hits = CircleHitbox.getUnitsInHitbox(eng, caster, caster.x, caster.y, THUNDERCLAP_RADIUS)
        .sort((a, b) => Math.hypot(a.x - caster.x, a.y - caster.y) - Math.hypot(b.x - caster.x, b.y - caster.y)
            || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, THUNDERCLAP_MAX_TARGETS);
    let charges = 0;
    for (const target of hits) {
        // Draw the charge out as the clap lands; it flows back to the caster as Static.
        const spent = spendMarkStacks(target, CONDUCTIVE_MARK_ID, THUNDERCLAP_CONDUCTIVE_SPENT_PER_ENEMY, eng.gameTime);
        charges += spent;
        if (spent > 0) spawnStormBolt(eng, target, caster, { fromUnitId: target.id, toUnitId: caster.id, duration: 0.3, width: 1.6, forks: 1, delay: 0.05 });
        const outcome = tryDamageOrBlock(target, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId: CARD_ID,
            damage: THUNDERCLAP_DAMAGE + (spent > 0 ? THUNDERCLAP_CONDUCTIVE_BONUS_DAMAGE : 0),
            attackType: 'melee',
        });
        if (!outcome.hit) continue;
        // An enemy that had no charge to give is left charged instead.
        if (spent === 0) applyMark(target, CONDUCTIVE_MARK_ID, THUNDERCLAP_CONDUCTIVE_STACKS, eng.gameTime, eng.roundNumber);
        tryApplyKnockbackByTier(target, THUNDERCLAP_KNOCKBACK_TIER, { unitId: caster.id, abilityId: CARD_ID }, caster.x, caster.y, eng);
    }

    // The spent charge flows back to the caster as Static.
    if (charges > 0) caster.getResource('static')?.add(charges * THUNDERCLAP_STATIC_PER_CHARGE);

    // The flash lights the dark: a Bright light where the clap went off.
    spawnBrightLight(eng as unknown as EngineWithLight, caster.x, caster.y, THUNDERCLAP_BRIGHT, STORM_SECONDARY, {
        unitId: caster.id,
        abilityId: CARD_ID,
        teamId: caster.teamId,
    });
});

const TOOLTIP_LINES = [
    'Deal {{DAMAGE}} damage to nearby enemies.',
    `{Conductive} enemies take {{BONUS}} extra damage and give you {${THUNDERCLAP_STATIC_PER_CHARGE}} Static. Other enemies become {Conductive}.`,
    `{Knockback ${THUNDERCLAP_KNOCKBACK_TIER}}`,
    `{Bright ${THUNDERCLAP_BRIGHT}}`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: THUNDERCLAP_DAMAGE },
    BONUS: { kind: 'damage', base: THUNDERCLAP_CONDUCTIVE_BONUS_DAMAGE },
};

export const ThunderclapAbility_1304 = defineAbility({
    id: CARD_ID,
    name: 'Thunderclap',
    image: THUNDERCLAP_IMAGE,
    resourceCost: { resourceId: 'static', amount: THUNDERCLAP_STATIC_COST },
    rechargeTurns: 1,
    maxUses: 1,
    prefireTime: THUNDERCLAP_WINDUP,
    aiSettings: { minRange: 0, maxRange: THUNDERCLAP_RADIUS },
    clearMovementOnComplete: true,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: THUNDERCLAP_WINDUP,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: 'Gather',
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        const eng = ctx.engine as EngineContext;
                        spawnStormRing(eng, ctx.caster, THUNDERCLAP_RADIUS, 'contract', THUNDERCLAP_WINDUP);
                        spawnStormSpark(eng, ctx.caster, { radius: ctx.caster.radius + 6, count: 6, duration: THUNDERCLAP_WINDUP });
                    }),
                },
            ],
        },
        {
            id: 'active',
            start: THUNDERCLAP_WINDUP,
            end: ACTIVE_END,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: 'Clap',
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Release',
                hitbox: THUNDERCLAP_HITBOX,
                filter: 'enemy',
                allowMiss: true,
                confirmAtCaster: true,
                lockOnMode: 'strictHitbox',
            },
            behaviour: clap,
        },
        {
            id: 'cooldown',
            start: ACTIVE_END,
            end: COOLDOWN_END,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    getAbilityStates: createMovementPenaltyStates(0.3, COOLDOWN_END),
    targets: [],

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(TOOLTIP_LINES, TOOLTIP_BINDINGS, resolveTooltipContext(gameState, { ability: { id: CARD_ID } }));
    },
});

export const ThunderclapCard_1304: CardDef = {
    abilityId: CARD_ID,
};
