/**
 * Force Push — lift one enemy, then fling them like a fast rock.
 *
 * Windup, pick an enemy, watch them rise, then aim a direction. They stay just off the ground
 * and bowl through enemies. Allies ricochet them. A wall drops them, stuns them, and bounces them.
 * Interrupt the cast after the pick and they fall where they are; the gravity is spent.
 */

import { AbilityEventType, type IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviour, CastBehaviourBaseContext } from '../../../abilities/castBehaviourTypes';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import {
    applyDirectionalKnockback,
    knockbackCtxFromEngine,
} from '../../../crowdControl/knockbackKeywords';
import { tryApplyHardCcStun } from '../../../crowdControl/tryApplyHardCcStun';
import { getEffectiveHardCcThreshold } from '../../../crowdControl/ccArmourState';
import { areEnemies } from '../../../game/teams';
import { Effect } from '../../../game/effects/Effect';
import { computeForcedDisplacement } from '../../../game/forceMove';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import type { ResolvedTarget } from '../../../game/types';
import { unitRangeHitbox, nullHitbox } from '../../../hitboxes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import {
    FORCE_PUSH_AIM_MAX_DISTANCE,
    FORCE_PUSH_AIM_MIN_DISTANCE,
    FORCE_PUSH_COLLISION_GRACE_PX,
    FORCE_PUSH_COOLDOWN_DURATION,
    FORCE_PUSH_DIRECTION_LABEL,
    FORCE_PUSH_ENEMY_DAMAGE,
    FORCE_PUSH_FALL_DURATION,
    FORCE_PUSH_FLIGHT_DISTANCE,
    FORCE_PUSH_FLIGHT_SPEED,
    FORCE_PUSH_FLUNG_HIT_DAMAGE,
    FORCE_PUSH_GRAVITY_COST,
    FORCE_PUSH_HIT_RADIUS,
    FORCE_PUSH_HOVER_HEIGHT_PX,
    FORCE_PUSH_KNOCKBACK_TIER,
    FORCE_PUSH_LEAN_DISTANCE,
    FORCE_PUSH_LIFT_DURATION,
    FORCE_PUSH_MAX_RANGE,
    FORCE_PUSH_PREFIRE_TIME,
    FORCE_PUSH_PUNCH_DISTANCE,
    FORCE_PUSH_PUNCH_RETURN,
    FORCE_PUSH_RELEASE_DURATION,
    FORCE_PUSH_SELECT_TICK,
    FORCE_PUSH_TARGET_LABEL,
    FORCE_PUSH_WALL_STUN_DURATION,
    FORCE_PUSH_WALL_TERRAIN_DAMAGE,
    FORCE_PUSH_WALL_UNIT_DAMAGE,
} from '../gravityConstants';
import { GRAVITY_VIOLET } from '../../../game/effect_defs/aoeEffects';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';
import {
    COLLISION_CLASH_EFFECT_TYPE,
    TERRAIN_IMPACT_EFFECT_TYPE,
} from '../../../game/effect_defs/impactEffects';
import type { AbilityEventRuntimeContext } from '../../../abilities/events/AbilityEventRuntime';
import { EXPOSED_BUFF_TYPE } from '../../../buffs/ExposedBuff';
import { applyHitStop } from '../../../buffs/HitStopBuff';
import {
    beginHoverLift,
    cancelHoverFlight,
    launchHoverFlight,
    registerHoverFlightHandler,
    type HoverFlightEngine,
    type HoverFlightUnitContact,
    type HoverFlightWallContact,
} from '../../../game/units/hoverFlight';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}02`;
const MAX_USES = 2;
const FORCE_PUSH_UNIT_HITBOX = unitRangeHitbox(FORCE_PUSH_MAX_RANGE);

const LIFT_START = FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_SELECT_TICK;
const LIFT_END = LIFT_START + FORCE_PUSH_LIFT_DURATION;
const AIM_END = LIFT_END + FORCE_PUSH_SELECT_TICK;
const RELEASE_END = AIM_END + FORCE_PUSH_RELEASE_DURATION;
const COOLDOWN_END = RELEASE_END + FORCE_PUSH_COOLDOWN_DURATION;

/** How far through the punch window the caster is at full extension. */
const PUNCH_IMPACT_AT = 0.35;

const TOOLTIP_LINES = [
    'Lift an enemy, then fling them. They stay just off the ground until they land or hit a wall.',
    'Enemies they hit take {{ENEMY_DAMAGE}} damage. They take {{FLUNG_DAMAGE}} each time they hit someone.',
    'A wall deals {{WALL_DAMAGE}} to them, stuns them, and bounces them off it. Allies ricochet them.',
    `{knockback ${FORCE_PUSH_KNOCKBACK_TIER}}`,
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    ENEMY_DAMAGE: { kind: 'damage', base: FORCE_PUSH_ENEMY_DAMAGE },
    FLUNG_DAMAGE: { kind: 'damage', base: FORCE_PUSH_FLUNG_HIT_DAMAGE },
    WALL_DAMAGE: { kind: 'damage', base: FORCE_PUSH_WALL_UNIT_DAMAGE },
};

const FORCE_PUSH_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fpGrad" x1="0" y1="0.5" x2="1" y2="0.5">
      <stop offset="0%" stop-color="#6b21a8" stop-opacity="0.2"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
  </defs>
  <circle cx="20" cy="32" r="10" fill="#1e1033" stroke="#a855f7" stroke-width="2"/>
  <path d="M32 32 L52 32" stroke="url(#fpGrad)" stroke-width="6" stroke-linecap="round"/>
  <path d="M46 24 L54 32 L46 40" stroke="#c084fc" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Bosses (and any armoured unit) can be picked only while Exposed. Structures never can. */
export function isForcePushTarget(unit: Unit, gameTime: number): boolean {
    if (!unit.isAlive()) return false;
    if (hasUnitTag(unit, UnitTag.Structure)) return false;
    if (unit.isInJuggernautWindow(gameTime) || unit.hasIFrames(gameTime)) return false;
    const needsExposed = hasUnitTag(unit, UnitTag.Boss) || getEffectiveHardCcThreshold(unit) > 0;
    if (needsExposed && !unit.hasBuff(EXPOSED_BUFF_TYPE)) return false;
    return true;
}

const liftCarry: CastBehaviour = {
    onTick(ctx) {
        if (!ctx.isFirstTick) return;
        const eng = ctx.engine as EngineContext;
        const target = flungUnitFromContext(ctx);
        if (!target || !isForcePushTarget(target, eng.gameTime)) return;
        const started = beginHoverLift(target, {
            hoverHeight: FORCE_PUSH_HOVER_HEIGHT_PX,
            liftDuration: FORCE_PUSH_LIFT_DURATION,
            fallDuration: FORCE_PUSH_FALL_DURATION,
            collisionRadius: Math.max(target.radius, FORCE_PUSH_HIT_RADIUS),
            collisionGrace: FORCE_PUSH_COLLISION_GRACE_PX,
            source: { unitId: ctx.caster.id, abilityId: ctx.abilityId },
            casterTeamId: ctx.caster.teamId,
        });
        if (!started) return;
        eng.interruptUnitAndRefundAbilities?.(target);
    },
    onInterrupt(ctx) {
        const target = flungUnitFromContext(ctx);
        if (target?.hoverFlight?.phase === 'lift') cancelHoverFlight(target);
    },
};

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: FORCE_PUSH_PREFIRE_TIME,
        abilityPhase: AbilityPhase.Windup,
        castBehaviours: [
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: CastBehaviours.CasterShake({ from: 1, to: 2 }),
            },
        ],
    },
    {
        id: 'selectTarget',
        start: FORCE_PUSH_PREFIRE_TIME,
        end: LIFT_START,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: FORCE_PUSH_TARGET_LABEL,
            hitbox: FORCE_PUSH_UNIT_HITBOX,
            filter: 'enemy',
            excludeUnitTags: [UnitTag.Structure],
            allowMiss: false,
            validatePick({ engine, pick }) {
                const unit = resolveTargetUnit(pick, engine as EngineContext);
                if (!unit) return false;
                return isForcePushTarget(unit, (engine as EngineContext).gameTime);
            },
        },
    },
    {
        id: 'lift',
        start: LIFT_START,
        end: LIFT_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            {
                timingStart: 'start',
                timingEnd: 'end',
                targetIndex: 0,
                behaviour: liftCarry,
            },
            {
                timingStart: 'start',
                timingEnd: 'end',
                targetIndex: 0,
                behaviour: CastBehaviours.CasterSlide({
                    forwardDistance: FORCE_PUSH_LEAN_DISTANCE,
                    backwardDistance: 0,
                    impactAt: 1,
                    direction: leanDirection,
                }),
            },
        ],
    },
    {
        id: 'selectDirection',
        start: LIFT_END,
        end: AIM_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: FORCE_PUSH_DIRECTION_LABEL,
            hitbox: nullHitbox,
            filter: 'any',
            allowMiss: true,
            anchorLabel: FORCE_PUSH_TARGET_LABEL,
            maxRangeFromAnchor: FORCE_PUSH_AIM_MAX_DISTANCE,
            minRangeFromAnchor: FORCE_PUSH_AIM_MIN_DISTANCE,
            aiHint: {
                kind: 'pixelFromAnchor',
                direction: 'awayFromCaster',
                distance: 'maxFromAnchor',
            },
        },
    },
    {
        id: 'release',
        start: AIM_END,
        end: RELEASE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            {
                timingStart: 'start',
                targetIndex: 1,
                behaviour: CastBehaviours.Instant(launchFromContext),
            },
            {
                timingStart: 'start',
                timingEnd: 'end',
                targetIndex: 1,
                behaviour: CastBehaviours.CasterSlide({
                    forwardDistance: FORCE_PUSH_PUNCH_DISTANCE,
                    backwardDistance: FORCE_PUSH_PUNCH_RETURN,
                    impactAt: PUNCH_IMPACT_AT,
                    direction: punchDirection,
                }),
            },
        ],
    },
    {
        id: 'cooldown',
        start: RELEASE_END,
        end: COOLDOWN_END,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

function resolveTargetUnit(
    target: ResolvedTarget | undefined,
    engine: EngineContext,
): Unit | null {
    if (!target || target.type !== 'unit' || !target.unitId) return null;
    return engine.getUnit(target.unitId) ?? null;
}

/**
 * A pick stored on the cast by its select label.
 * Interactive targeting writes each click into `targetsByLabel`, then replaces the positional
 * `targets` array with that click's own list. Later selects must not read `targets` by index.
 */
function labelledPick(ctx: CastBehaviourBaseContext, label: string): ResolvedTarget | undefined {
    const active = ctx.caster.activeAbilities.find((ability) => ability.abilityId === ctx.abilityId);
    return active?.targetsByLabel?.[label];
}

function flungUnitFromContext(ctx: CastBehaviourBaseContext): Unit | null {
    const eng = ctx.engine as EngineContext;
    return resolveTargetUnit(
        labelledPick(ctx, FORCE_PUSH_TARGET_LABEL) ?? ctx.allTargets[0] ?? ctx.target,
        eng,
    );
}

function aimPixelFromContext(ctx: CastBehaviourBaseContext): { x: number; y: number } | null {
    const labelled = labelledPick(ctx, FORCE_PUSH_DIRECTION_LABEL);
    if (labelled?.type === 'pixel' && labelled.position) return labelled.position;
    if (ctx.target?.type === 'pixel' && ctx.target.position) return ctx.target.position;
    for (const candidate of ctx.allTargets) {
        if (candidate.type === 'pixel' && candidate.position) return candidate.position;
    }
    return null;
}

function leanDirection(ctx: CastBehaviourBaseContext): { x: number; y: number } | null {
    const target = flungUnitFromContext(ctx);
    if (!target) return null;
    return directionBetween(ctx.caster, target);
}

function punchDirection(ctx: CastBehaviourBaseContext): { x: number; y: number } | null {
    const pixel = aimPixelFromContext(ctx);
    const target = flungUnitFromContext(ctx);
    if (!pixel || !target) return null;
    return directionBetween(target, pixel);
}

function directionBetween(
    from: { x: number; y: number },
    to: { x: number; y: number },
): { x: number; y: number } | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return null;
    return { x: dx / len, y: dy / len };
}

function launchFromContext(ctx: CastBehaviourBaseContext): void {
    const eng = ctx.engine as EngineContext;
    const target = flungUnitFromContext(ctx);
    const pixel = aimPixelFromContext(ctx);
    if (!target || !pixel) return;
    if (!isForcePushTarget(target, eng.gameTime) || target.hoverFlight?.phase !== 'lift') {
        if (target?.hoverFlight?.phase === 'lift') cancelHoverFlight(target);
        return;
    }
    launchHoverFlight(
        target,
        { x: pixel.x - target.x, y: pixel.y - target.y },
        FORCE_PUSH_FLIGHT_SPEED,
        FORCE_PUSH_FLIGHT_DISTANCE,
    );
}

function dropIfStillLifted(engine: EngineContext, activeTargets: ResolvedTarget[] | undefined, byLabel: Record<string, ResolvedTarget> | undefined): void {
    const target = resolveTargetUnit(byLabel?.[FORCE_PUSH_TARGET_LABEL] ?? activeTargets?.[0], engine);
    if (target?.hoverFlight?.phase === 'lift') cancelHoverFlight(target);
}

function spawnClash(engine: HoverFlightEngine, x: number, y: number): void {
    engine.addEffect?.(new Effect({
        x,
        y,
        duration: 0.35,
        effectType: COLLISION_CLASH_EFFECT_TYPE,
        effectData: { color: GRAVITY_VIOLET },
    }));
}

function onFlingUnitHit(contact: HoverFlightUnitContact, engine: HoverFlightEngine): void {
    const source = contact.mover.hoverFlight?.source;
    if (!source) return;
    const round = engine.roundNumber ?? 1;
    if (!contact.mover.hasIFrames(engine.gameTime)) {
        contact.mover.takeDamage(FORCE_PUSH_FLUNG_HIT_DAMAGE, source.unitId, engine.eventBus);
    }
    spawnClash(engine, contact.impact.x, contact.impact.y);
    if (contact.response === 'pass' && areEnemies(contact.mover.hoverFlight?.casterTeamId ?? 'player', contact.other.teamId)) {
        if (!contact.other.hasIFrames(engine.gameTime)) {
            contact.other.takeDamage(FORCE_PUSH_ENEMY_DAMAGE, source.unitId, engine.eventBus);
        }
        applyDirectionalKnockback(
            contact.other,
            FORCE_PUSH_KNOCKBACK_TIER,
            contact.travelDir,
            source,
            knockbackCtxFromEngine(engine),
        );
    }
    applyHitStop([contact.mover, contact.other], engine.gameTime, round);
}

function onFlingWall(contact: HoverFlightWallContact, engine: HoverFlightEngine): void {
    const source = contact.mover.hoverFlight?.source;
    if (!source) return;
    const round = engine.roundNumber ?? 1;
    if (!contact.mover.hasIFrames(engine.gameTime)) {
        contact.mover.takeDamage(FORCE_PUSH_WALL_UNIT_DAMAGE, source.unitId, engine.eventBus);
    }
    if (contact.kind === 'terrain') {
        engine.terrainManager?.damageRock(
            contact.tile.col,
            contact.tile.row,
            FORCE_PUSH_WALL_TERRAIN_DAMAGE,
            source.unitId,
        );
        engine.addEffect?.(new Effect({
            x: contact.impact.x,
            y: contact.impact.y,
            duration: 0.45,
            effectType: TERRAIN_IMPACT_EFFECT_TYPE,
            effectData: {
                color: GRAVITY_VIOLET,
                tile: contact.tile,
                impact: contact.impact,
            },
        }));
    } else {
        spawnClash(engine, contact.impact.x, contact.impact.y);
    }
    applyDirectionalKnockback(
        contact.mover,
        FORCE_PUSH_KNOCKBACK_TIER,
        contact.reflectedDir,
        source,
        knockbackCtxFromEngine(engine),
    );
    tryApplyHardCcStun(
        contact.mover,
        FORCE_PUSH_WALL_STUN_DURATION,
        engine.gameTime,
        round,
        engine.eventBus,
    );
    applyHitStop([contact.mover], engine.gameTime, round);
}

registerHoverFlightHandler(CARD_ID, {
    onUnit: onFlingUnitHit,
    onWall: onFlingWall,
});

function aimTip(
    anchor: { x: number; y: number },
    mouse: { x: number; y: number },
    engine: EngineContext | undefined,
): { x: number; y: number } {
    let dx = mouse.x - anchor.x;
    let dy = mouse.y - anchor.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) {
        dx = 1;
        dy = 0;
    } else {
        dx /= len;
        dy /= len;
    }
    const end = {
        x: anchor.x + dx * FORCE_PUSH_FLIGHT_DISTANCE,
        y: anchor.y + dy * FORCE_PUSH_FLIGHT_DISTANCE,
    };
    const terrainManager = engine?.terrainManager ?? null;
    if (!terrainManager) return end;
    const disp = computeForcedDisplacement(anchor.x, anchor.y, end.x, end.y, FORCE_PUSH_FLIGHT_DISTANCE, {
        terrainManager,
        forced: true,
    });
    return { x: anchor.x + disp.dx, y: anchor.y + disp.dy };
}

export const ForcePushAbility = defineAbility({
    id: CARD_ID,
    name: 'Force Push',
    image: FORCE_PUSH_IMAGE,
    resourceCost: { resourceId: 'gravity', amount: FORCE_PUSH_GRAVITY_COST },
    rechargeTurns: 1,
    maxUses: MAX_USES,
    prefireTime: FORCE_PUSH_PREFIRE_TIME,
    abilityTimings: ABILITY_TIMINGS,
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: FORCE_PUSH_MAX_RANGE },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: FORCE_PUSH_MAX_RANGE };
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },

    abilityEvents: {
        [AbilityEventType.ON_CAST_END]: [
            {
                conditions: [{ type: 'always' }],
                effects: [{
                    type: 'custom',
                    effectId: 'forcePushDropIfUnlaunched',
                    comment: 'An interrupt after the pick, before the fling, drops the lifted unit. A launched fling keeps going.',
                }],
            },
        ],
    },

    customEffectHandlers: {
        forcePushDropIfUnlaunched: (_params, ctx) => {
            const runtime = ctx as AbilityEventRuntimeContext;
            const eng = runtime.engine as EngineContext;
            dropIfStillLifted(eng, runtime.activeAbility?.targets, runtime.activeAbility?.targetsByLabel);
        },
    },

    renderActivePreview(gr, caster, active, _gameTime, engine): void {
        const eng = engine as EngineContext | undefined;
        if (!eng?.getUnit) return;
        const target = resolveTargetUnit(
            active.targetsByLabel?.[FORCE_PUSH_TARGET_LABEL] ?? active.targets[0],
            eng,
        );
        if (!target?.hoverFlight || target.hoverFlight.phase !== 'lift') return;
        drawTether(gr, caster, target);
    },

    renderTargetingPreviewSelectedTargets(gr, _caster, targets, mouseWorld, _units, engine): void {
        const anchorTarget = targets[0];
        if (!anchorTarget) return;
        const eng = engine as EngineContext | undefined;
        if (!eng) return;
        const anchor = resolveTargetToPoint(anchorTarget, eng);
        if (!anchor) return;
        const tip = aimTip(anchor, mouseWorld, eng);
        const width = FORCE_PUSH_HIT_RADIUS * 2;
        gr.moveTo(anchor.x, anchor.y);
        gr.lineTo(tip.x, tip.y);
        gr.stroke({ color: GRAVITY_VIOLET, width, alpha: 0.22 });
        gr.moveTo(anchor.x, anchor.y);
        gr.lineTo(tip.x, tip.y);
        gr.stroke({ color: GRAVITY_VIOLET, width: 2, alpha: 0.85 });
        gr.circle(tip.x, tip.y, FORCE_PUSH_HIT_RADIUS);
        gr.stroke({ color: GRAVITY_VIOLET, width: 2, alpha: 0.7 });
    },
});

function drawTether(gr: IAbilityPreviewGraphics, from: { x: number; y: number }, to: { x: number; y: number }): void {
    gr.moveTo(from.x, from.y);
    gr.lineTo(to.x, to.y);
    gr.stroke({ color: GRAVITY_VIOLET, width: 5, alpha: 0.2 });
    gr.moveTo(from.x, from.y);
    gr.lineTo(to.x, to.y);
    gr.stroke({ color: 0xe9d5ff, width: 2, alpha: 0.9 });
}

export const ForcePushCard: CardDef = {
    abilityId: CARD_ID,
};
