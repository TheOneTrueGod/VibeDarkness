/**
 * Thunderclap - the caster dumps every bit of Static they carry in one deafening burst. Charge gathers
 * in a tightening ring, then a storm-blue shockwave and a fan of bolts throw nearby enemies back and
 * leave them Conductive. The more you ran to build Static, the harder it hits; the flash lights the
 * dark around you, so it doubles as a way to see what is coming.
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { spawnBrightLight, type EngineWithLight } from '../../../abilities/brightKeyword';
import { getAbilityResourceCosts } from '../../../abilities/Ability';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { createMovementPenaltyStates } from '../../../abilities/shieldHelpers';
import { applyMark } from '../../../buffs/MarkBuff';
import { tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import { CircleHitbox, ringHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import {
    CONDUCTIVE_MARK_ID,
    STORM_SECONDARY,
    THUNDERCLAP_ABILITY_ID,
    THUNDERCLAP_BASE_DAMAGE,
    THUNDERCLAP_BIG_FLASH_STATIC,
    THUNDERCLAP_CONDUCTIVE_STACKS,
    THUNDERCLAP_COOLDOWN,
    THUNDERCLAP_DAMAGE_PER_STATIC,
    THUNDERCLAP_KNOCKBACK_TIER,
    THUNDERCLAP_MAX_TARGETS,
    THUNDERCLAP_MIN_STATIC,
    THUNDERCLAP_RADIUS,
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

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];


/** Thunderclap's damage when `spentStatic` Static went into it. */
export function getThunderclapDamage(spentStatic: number): number {
    return THUNDERCLAP_BASE_DAMAGE + THUNDERCLAP_DAMAGE_PER_STATIC * spentStatic;
}

/**
 * Spend everything left in `resourceId` and return the total the cast used: the up-front cost (already
 * paid by the order) plus whatever was still in the pool.
 */
function drainRemainingResource(caster: Unit, resourceId: string, paidUpFront: number): number {
    const resource = caster.getResource(resourceId);
    if (!resource) return paidUpFront;
    const rest = Math.max(0, Math.floor(resource.current));
    resource.spend(rest);
    return paidUpFront + rest;
}

const clap = CastBehaviours.Instant((ctx) => {
    const eng = ctx.engine as EngineContext;
    const caster = ctx.caster;
    const paid = getAbilityResourceCosts(ThunderclapAbility_1304, caster)[0]?.amount ?? THUNDERCLAP_MIN_STATIC;
    const spent = drainRemainingResource(caster, 'static', paid);
    const damage = getThunderclapDamage(spent);

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
    for (const target of hits) {
        const outcome = tryDamageOrBlock(target, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId: CARD_ID,
            damage,
            attackType: 'melee',
        });
        if (!outcome.hit) continue;
        applyMark(target, CONDUCTIVE_MARK_ID, THUNDERCLAP_CONDUCTIVE_STACKS, eng.gameTime, eng.roundNumber);
        tryApplyKnockbackByTier(target, THUNDERCLAP_KNOCKBACK_TIER, { unitId: caster.id, abilityId: CARD_ID }, caster.x, caster.y, eng);
    }

    // The flash lights the dark: a Bright light where the clap went off, stronger for a big discharge.
    spawnBrightLight(eng as unknown as EngineWithLight, caster.x, caster.y, spent >= THUNDERCLAP_BIG_FLASH_STATIC ? 2 : 1, STORM_SECONDARY, {
        unitId: caster.id,
        abilityId: CARD_ID,
        teamId: caster.teamId,
    });
});

const TOOLTIP_LINES = [
    'Release all your Static in a burst, dealing {{BASE}} damage plus {{PER}} per Static to nearby enemies.',
    `{Conductive ${THUNDERCLAP_CONDUCTIVE_STACKS}}`,
    `{knockback ${THUNDERCLAP_KNOCKBACK_TIER}}`,
    '{Bright 1}',
    `Becomes {Bright 2} with {${THUNDERCLAP_BIG_FLASH_STATIC}} or more Static.`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    BASE: { kind: 'damage', base: THUNDERCLAP_BASE_DAMAGE },
    PER: { kind: 'damage', base: THUNDERCLAP_DAMAGE_PER_STATIC },
};

export const ThunderclapAbility_1304 = defineAbility({
    id: CARD_ID,
    name: 'Thunderclap',
    image: THUNDERCLAP_IMAGE,
    resourceCost: { resourceId: 'static', amount: THUNDERCLAP_MIN_STATIC },
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
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
