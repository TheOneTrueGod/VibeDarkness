/**
 * Chain Lightning - the Storm Core's payoff. The caster draws charge in, then lashes a bolt at one enemy
 * that leaps from body to body, seeking out Conductive enemies first. A Conductive enemy loses its stacks,
 * takes a little extra damage and is staggered. Metal on the ground (your dropped weapons, your turrets) carries
 * the bolt across gaps, so an Armory field or a Gravity pile-up turns one cast into a sweep.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { resolveChainHops, type ChainHop, type ChainRelayPoint } from '../../../abilities/chainHops';
import { hasResearchNode, resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { consumeMark, getMarkStacks } from '../../../buffs/MarkBuff';
import { tryApplyStagger } from '../../../crowdControl/tryApplyStagger';
import type { EngineContext } from '../../../game/EngineContext';
import { areEnemies } from '../../../game/teams';
import type { Unit } from '../../../game/units/Unit';
import { unitRangeHitbox, type HitboxEngineContext } from '../../../hitboxes';
import { type CardDef } from '../../types';
import { STORM_NODE_FORKED_LIGHTNING, STORM_TREE_ID } from '../../../../../researchTrees/trees/storm';
import {
    CHAIN_LIGHTNING_ABILITY_ID,
    CHAIN_LIGHTNING_COOLDOWN,
    CHAIN_LIGHTNING_CONDUCTIVE_BONUS_DAMAGE,
    CHAIN_LIGHTNING_DAMAGE,
    CHAIN_LIGHTNING_HOP_DELAY,
    CHAIN_LIGHTNING_JUMP_RANGE,
    CHAIN_LIGHTNING_JUMPS,
    CHAIN_LIGHTNING_MAX_CONDUCTOR_RELAYS,
    CHAIN_LIGHTNING_MAX_USES,
    CHAIN_LIGHTNING_RANGE,
    CHAIN_LIGHTNING_STAGGER_SECONDS,
    CHAIN_LIGHTNING_STATIC_COST,
    CHAIN_LIGHTNING_WINDUP,
    CONDUCTIVE_MARK_ID,
    FORKED_LIGHTNING_EXTRA_JUMPS,
    STORM_PRIMARY,
    STORM_SECONDARY,
} from '../stormConstants';
import { spawnStormBolt, spawnStormRing, spawnStormSpark } from '../stormVfx';
import CHAIN_LIGHTNING_IMAGE from './chainLightning.svg?raw';

const CARD_ID = CHAIN_LIGHTNING_ABILITY_ID;
const ACTIVE_END = CHAIN_LIGHTNING_WINDUP + 0.05;
const COOLDOWN_END = ACTIVE_END + CHAIN_LIGHTNING_COOLDOWN;

const CHAIN_LIGHTNING_HITBOX = unitRangeHitbox(CHAIN_LIGHTNING_RANGE);


/** Jumps after the first strike, with Forked Lightning. */
export function getChainLightningJumps(engine: AbilityEngineContext | undefined, caster: Unit | undefined): number {
    const forked = hasResearchNode(engine, caster, STORM_TREE_ID, STORM_NODE_FORKED_LIGHTNING);
    return CHAIN_LIGHTNING_JUMPS + (forked ? FORKED_LIGHTNING_EXTRA_JUMPS : 0);
}

type ChainEngine = AbilityEngineContext & Partial<Pick<EngineContext, 'findDeployables'>>;

/** Own-team metal on the ground (dropped weapons, placed deployables): the bolt's free relays. */
export function findChainConductors(engine: ChainEngine | undefined, caster: Unit): ChainRelayPoint[] {
    if (!engine?.findDeployables) return [];
    return engine
        .findDeployables({ castingTeam: caster.teamId, near: { x: caster.x, y: caster.y }, tags: ['conductor'] })
        .map((d) => ({ id: `${d.kind}:${d.id}`, x: d.x, y: d.y }));
}

/** The chain this cast would make from `first`. Shared by the cast and the targeting preview. */
export function resolveChainLightningHops(
    engine: ChainEngine | undefined,
    caster: Unit,
    first: Unit,
    units: Unit[],
    gameTime: number,
): ChainHop[] {
    const hitboxEngine: HitboxEngineContext = {
        units,
        getUnit: (id) => units.find((u) => u.id === id),
        gameTime,
    };
    return resolveChainHops({
        engine: hitboxEngine,
        caster,
        first,
        maxJumps: getChainLightningJumps(engine, caster),
        jumpRange: CHAIN_LIGHTNING_JUMP_RANGE,
        priority: (u) => getMarkStacks(u, CONDUCTIVE_MARK_ID, gameTime),
        relays: findChainConductors(engine, caster),
        maxRelays: CHAIN_LIGHTNING_MAX_CONDUCTOR_RELAYS,
    });
}

function nearestEnemyInRangeOfCursor(caster: Unit, units: Unit[], mouse: { x: number; y: number }): Unit | undefined {
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const u of units) {
        if (!u.isAlive() || !areEnemies(caster.teamId, u.teamId)) continue;
        if (Math.hypot(u.x - caster.x, u.y - caster.y) > CHAIN_LIGHTNING_RANGE) continue;
        const d = Math.hypot(u.x - mouse.x, u.y - mouse.y);
        if (d < bestD && d <= u.radius + 50) {
            best = u;
            bestD = d;
        }
    }
    return best;
}

const strikeChain = CastBehaviours.Instant((ctx) => {
    const eng = ctx.engine as EngineContext;
    const first = ctx.target.type === 'unit' && ctx.target.unitId ? eng.getUnit(ctx.target.unitId) : undefined;
    if (!first?.isAlive()) return;
    const hops = resolveChainLightningHops(eng as unknown as ChainEngine, ctx.caster, first, eng.units, eng.gameTime);

    let prev: { x: number; y: number; unitId?: string } = { x: ctx.caster.x, y: ctx.caster.y, unitId: ctx.caster.id };
    hops.forEach((hop, i) => {
        const delay = i * CHAIN_LIGHTNING_HOP_DELAY;
        spawnStormBolt(eng, prev, hop, {
            delay,
            duration: 0.32,
            width: 2.4,
            forks: 2,
            ...(prev.unitId ? { fromUnitId: prev.unitId } : {}),
            ...(hop.kind === 'unit' ? { toUnitId: hop.unit.id } : {}),
        });
        if (hop.kind === 'relay') {
            // The metal flares as the bolt passes through it.
            spawnStormSpark(eng, hop, { radius: 22, count: 9, delay });
            prev = { x: hop.x, y: hop.y };
            return;
        }
        const target = hop.unit;
        const stacks = consumeMark(target, CONDUCTIVE_MARK_ID, eng.gameTime);
        const outcome = tryDamageOrBlock(target, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: prev.x,
            attackerY: prev.y,
            attackerId: ctx.caster.id,
            abilityId: CARD_ID,
            damage: CHAIN_LIGHTNING_DAMAGE + (stacks > 0 ? CHAIN_LIGHTNING_CONDUCTIVE_BONUS_DAMAGE : 0),
            attackType: 'ranged' as 'melee' | 'charging',
        });
        if (stacks > 0 && outcome.hit) tryApplyStagger(target, CHAIN_LIGHTNING_STAGGER_SECONDS, eng);
        spawnStormSpark(eng, target, { radius: target.radius + 12 + stacks * 4, count: 6 + stacks * 2, delay });
        prev = { x: target.x, y: target.y, unitId: target.id };
    });
});

const TOOLTIP_LINES = [
    'Strike an enemy for {{DAMAGE}} damage. The lightning leaps to {{JUMPS}} more enemies.',
    '{Conductive} enemies are hit first, take {{BONUS}} extra damage and are staggered.',
] as const;

export const ChainLightningAbility_1303 = defineAbility({
    id: CARD_ID,
    name: 'Chain Lightning',
    image: CHAIN_LIGHTNING_IMAGE,
    resourceCost: { resourceId: 'static', amount: CHAIN_LIGHTNING_STATIC_COST },
    rechargeTurns: 1,
    maxUses: CHAIN_LIGHTNING_MAX_USES,
    prefireTime: CHAIN_LIGHTNING_WINDUP,
    aiSettings: { minRange: 0, maxRange: CHAIN_LIGHTNING_RANGE },
    clearMovementOnComplete: true,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: CHAIN_LIGHTNING_WINDUP,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: 'Gather',
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        // Charge is drawn in from all around, converging on the caster as the windup ends.
                        spawnStormRing(ctx.engine as EngineContext, ctx.caster, ctx.caster.radius + 34, 'contract', CHAIN_LIGHTNING_WINDUP);
                        spawnStormSpark(ctx.engine as EngineContext, ctx.caster, {
                            radius: ctx.caster.radius + 8,
                            count: 5,
                            duration: CHAIN_LIGHTNING_WINDUP,
                        });
                    }),
                },
            ],
        },
        {
            id: 'active',
            start: CHAIN_LIGHTNING_WINDUP,
            end: ACTIVE_END,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: 'Strike',
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Enemy',
                hitbox: CHAIN_LIGHTNING_HITBOX,
                filter: 'enemy',
                allowMiss: false,
            },
            behaviour: strikeChain,
        },
        {
            id: 'cooldown',
            start: ACTIVE_END,
            end: COOLDOWN_END,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],

    renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld, units, gameState): void {
        gr.circle(caster.x, caster.y, CHAIN_LIGHTNING_RANGE);
        gr.stroke({ color: STORM_PRIMARY, width: 1, alpha: 0.45 });
        const first = nearestEnemyInRangeOfCursor(caster, units, mouseWorld);
        if (!first) return;
        const eng = gameState as ChainEngine | undefined;
        const gameTime = (eng as { gameTime?: number } | undefined)?.gameTime ?? 0;
        const hops = resolveChainLightningHops(eng, caster, first, units, gameTime);
        let prev = { x: caster.x, y: caster.y };
        for (const hop of hops) {
            gr.moveTo(prev.x, prev.y);
            gr.lineTo(hop.x, hop.y);
            gr.stroke({ color: STORM_SECONDARY, width: 2, alpha: hop.kind === 'relay' ? 0.45 : 0.8 });
            if (hop.kind === 'unit') {
                const stacks = getMarkStacks(hop.unit, CONDUCTIVE_MARK_ID, gameTime);
                gr.circle(hop.x, hop.y, hop.unit.radius + 4 + stacks * 2);
                gr.stroke({ color: STORM_SECONDARY, width: stacks > 0 ? 2.5 : 1.5, alpha: 0.9 });
            } else {
                gr.circle(hop.x, hop.y, 8);
                gr.stroke({ color: STORM_SECONDARY, width: 1.5, alpha: 0.6 });
            }
            prev = { x: hop.x, y: hop.y };
        }
    },

    getTooltipText(gameState?: unknown): string[] {
        const bindings: TooltipTokenBindings = {
            JUMPS: { kind: 'plain', value: getChainLightningJumps(gameState as AbilityEngineContext | undefined, undefined) },
            DAMAGE: { kind: 'damage', base: CHAIN_LIGHTNING_DAMAGE },
            BONUS: { kind: 'damage', base: CHAIN_LIGHTNING_CONDUCTIVE_BONUS_DAMAGE },
        };
        return formatTooltipLegacyLines(TOOLTIP_LINES, bindings, resolveTooltipContext(gameState, { ability: { id: CARD_ID } }));
    },
});

export const ChainLightningCard_1303: CardDef = {
    abilityId: CARD_ID,
};
