/**
 * Crystal Laser - Court Magician super, enraged only. Time stops: he gathers violet light while every
 * crystal glides in to form a tight wall in front of him, facing a player. Time resumes with red
 * sight-lines showing the lane, then the wall fires one huge laser (a ray from every crystal) for half
 * a round, slowly turning to follow that player. Each ray stops on the first body it meets and burns
 * and pushes it; a raised shield stops it cold and covers everyone behind, so the party wins by
 * taking turns in front with their shields.
 */

import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { haltCommandedUnits } from '../../../abilities/commandUnits';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { BeamRay } from '../../../abilities/CastBehaviours/BeamBehaviour';
import type { TargetDef } from '../../../abilities/targeting';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { spawnCasterChargeUpEffect } from '../../../abilities/casterChargeUpVisual';
import { Effect } from '../../../game/effects/Effect';
import { BEAM_SEGMENT_EFFECT_TYPE, type BeamSegmentEffectData } from '../../../game/effect_defs/beamEffects';
import { FORMATION_PRESETS, formationSlots, type FormationPoint } from '../../../game/formations/formationDef';
import { fitSlotsToTerrain } from '../../../game/formations/formationPlacement';
import type { StartTimeStopSpec, TimeStop } from '../../../game/time/TimeManager';
import { ROUND_DURATION } from '../../../game/gameConstants';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { getBoundUnits } from '../../../game/units/boundUnits';
import { UnitTag } from '../../../game/units/unitTag';
import { getCastElapsedAt } from '../../../game/time/actorClock';
import type { CardDef } from '../../types';
import {
    COURT_CRYSTAL_ID,
    COURT_ORCHID,
    COURT_PULSE_COLORS,
    COURT_TELEGRAPH_RED,
    COURT_VIOLET,
    CRYSTAL_LASER_ABILITY_ID,
    crystalLandingPulse,
} from '../courtMagicianConstants';
import IMAGE from './crystalLaser.svg?raw';

// ---- Timeline (cast seconds; the caster is exempt from his own Time Stop, so these are also tick seconds) ----
/** Time Stop length: gather + assemble + focus. */
export const CRYSTAL_LASER_FREEZE_SEC = 2.2;
/** Action title shown while time is stopped. */
export const CRYSTAL_LASER_TITLE = 'Crystal Laser';
const GATHER_END = 0.6;
const ASSEMBLE_END = 1.8;
/** World running again; red sight-lines give the party this long to get shields up. */
export const CRYSTAL_LASER_AIM_SEC = 1.2;
const AIM_END = CRYSTAL_LASER_FREEZE_SEC + CRYSTAL_LASER_AIM_SEC;
/** The beam itself: half a round. */
export const CRYSTAL_LASER_FIRE_SEC = ROUND_DURATION * 0.5;
const FIRE_END = AIM_END + CRYSTAL_LASER_FIRE_SEC;
const COOLDOWN_END = FIRE_END + 0.8;

// ---- Beam ----
export const CRYSTAL_LASER_PULSE_SEC = 0.25;
/** Damage per pulse to each body a ray stops on (one hit per body per pulse, however many rays touch it). */
export const CRYSTAL_LASER_PULSE_DAMAGE = 2;
/** Push (px) along the beam per landed pulse; a blocked pulse pushes half as far. */
export const CRYSTAL_LASER_PUSH_PX = 4;
export const CRYSTAL_LASER_LENGTH = 900;
export const CRYSTAL_LASER_RAY_RADIUS = 4;
/** How fast the beam turns to follow its target. */
export const CRYSTAL_LASER_TURN_DEG_PER_SEC = 32.5;
/** Rays stopped by rock chip it: a full rock breaks after this many pulses (2.5s of beam). */
export const CRYSTAL_LASER_ROCK_HITS_TO_BREAK = 10;
/** Fires every other round (rounds 0, 2, 4, ... of the fight), once. */
export const CRYSTAL_LASER_ROUND_INTERVAL = 2;
export const CRYSTAL_LASER_AI_RANGE = 600;

type LaserEngine = AbilityEngineContext & {
    startTimeStop?(spec: StartTimeStopSpec): TimeStop;
    endTimeStop?(id: string): boolean;
};

export interface CrystalLaserPayload {
    /** The player the beam follows (from the order's tracked unit), if any. */
    trackUnitId?: string;
    /** Target position at cast start (fallback aim and telegraph direction). */
    targetX: number;
    targetY: number;
    /** Wall slots the crystals glide to, fitted to the map at cast start. */
    slots: FormationPoint[];
    /** Id of this cast's Time Stop, once started. */
    timeStopId?: string;
}

export function readCrystalLaserPayload(active: { castPayload?: unknown } | undefined): CrystalLaserPayload | null {
    const p = active?.castPayload as Partial<CrystalLaserPayload> | undefined;
    return p && Array.isArray(p.slots) && typeof p.targetX === 'number' ? (p as CrystalLaserPayload) : null;
}

function payloadOf(ctx: CastBehaviourTickContext): CrystalLaserPayload | null {
    return readCrystalLaserPayload({ castPayload: ctx.castPayload });
}

function crystalsOf(ctx: CastBehaviourTickContext): Unit[] {
    return getBoundUnits(ctx.engine.units, ctx.caster, COURT_CRYSTAL_ID);
}

/** Live position of the tracked player, else the cast-start target point. */
function aimPoint(ctx: CastBehaviourTickContext): { x: number; y: number } | null {
    const p = payloadOf(ctx);
    const tracked = p?.trackUnitId ? ctx.engine.getUnit(p.trackUnitId) : undefined;
    if (tracked?.isAlive()) return { x: tracked.x, y: tracked.y };
    return p ? { x: p.targetX, y: p.targetY } : null;
}

function startFreeze(ctx: CastBehaviourTickContext): void {
    const eng = ctx.engine as LaserEngine;
    // Recall every crystal: a ram in progress or queued would fight the wall glide (and resume after the
    // freeze), leaving a crystal stranded out of formation.
    haltCommandedUnits(ctx.engine, crystalsOf(ctx));
    const stop = eng.startTimeStop?.({
        sourceActorId: ctx.caster.id,
        durationTickSeconds: CRYSTAL_LASER_FREEZE_SEC,
        exemptActorIds: [ctx.caster.id],
    });
    const payload = payloadOf(ctx);
    if (payload && stop) payload.timeStopId = stop.id;
    // Action-scene title across the screen for the length of the freeze (wall clock, so it plays through it).
    ctx.engine.eventBus.emit('action_title', {
        text: CRYSTAL_LASER_TITLE,
        durationSec: CRYSTAL_LASER_FREEZE_SEC,
        glowColor: COURT_ORCHID,
    });
    spawnCasterChargeUpEffect(eng, ctx.caster, CRYSTAL_LASER_FREEZE_SEC, { color: COURT_ORCHID, ringCount: 6 });
    eng.addEffect(
        new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: 0.8,
            effectType: 'Pulse',
            effectData: { colors: [...COURT_PULSE_COLORS] },
            pauseBehaviour: 'continue',
        }),
    );
}

function endFreeze(ctx: CastBehaviourTickContext): void {
    const id = payloadOf(ctx)?.timeStopId;
    if (id) (ctx.engine as LaserEngine).endTimeStop?.(id);
}

function drawBeam(ctx: CastBehaviourTickContext, rays: BeamRay[]): void {
    for (const ray of rays) {
        const data: BeamSegmentEffectData = {
            toX: ray.end.x,
            toY: ray.end.y,
            width: 9,
            color: COURT_ORCHID,
            impact: ray.hitUnitId !== undefined,
        };
        ctx.engine.addEffect(
            new Effect({
                x: ray.origin.x,
                y: ray.origin.y,
                duration: CRYSTAL_LASER_PULSE_SEC * 1.6,
                effectType: BEAM_SEGMENT_EFFECT_TYPE,
                effectData: { ...data },
                pauseBehaviour: 'hold',
            }),
        );
    }
}

const _base: AbilityStatic = defineAbility({
    id: CRYSTAL_LASER_ABILITY_ID,
    name: 'Crystal Laser',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 1,
    prefireTime: AIM_END,
    requiredTags: [UnitTag.Enraged],
    // Constant damage: no hit freeze per pulse.
    hitImpact: { hitstopSeconds: 0, hitstunSeconds: 0 },
    abilityTimings: [
        {
            id: 'gather',
            start: 0,
            end: GATHER_END,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: 'Time Stop',
            castBehaviours: [
                { timingStart: 'start', behaviour: CastBehaviours.Instant(startFreeze) },
                { timingStart: 'start', timingEnd: 'end', behaviour: CastBehaviours.CasterShake({ from: 0, to: 2 }) },
            ],
        },
        {
            id: 'assemble',
            start: GATHER_END,
            end: ASSEMBLE_END,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.Arrange({
                        units: crystalsOf,
                        flight: true,
                        slots: (ctx) => payloadOf(ctx)?.slots ?? [],
                        onArrive: (ctx, unit) =>
                            ctx.engine.addEffect(crystalLandingPulse(unit, { pauseBehaviour: 'continue' })),
                    }),
                },
            ],
        },
        { id: 'focus', start: ASSEMBLE_END, end: CRYSTAL_LASER_FREEZE_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'aim',
            start: CRYSTAL_LASER_FREEZE_SEC,
            end: AIM_END,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [{ timingStart: 'start', behaviour: CastBehaviours.Instant(endFreeze) }],
        },
        {
            id: 'fire',
            start: AIM_END,
            end: FIRE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.Beam({
                        everySeconds: CRYSTAL_LASER_PULSE_SEC,
                        windowSeconds: CRYSTAL_LASER_FIRE_SEC,
                        origins: (ctx) => crystalsOf(ctx).map((c) => ({ x: c.x, y: c.y })),
                        aim: aimPoint,
                        turnRateDegPerSec: CRYSTAL_LASER_TURN_DEG_PER_SEC,
                        rockHitsToBreak: CRYSTAL_LASER_ROCK_HITS_TO_BREAK,
                        length: CRYSTAL_LASER_LENGTH,
                        rayRadius: CRYSTAL_LASER_RAY_RADIUS,
                        damage: CRYSTAL_LASER_PULSE_DAMAGE,
                        pushPx: CRYSTAL_LASER_PUSH_PX,
                        pushOnBlockPx: CRYSTAL_LASER_PUSH_PX / 2,
                        onPulse: drawBeam,
                    }),
                },
            ],
        },
        { id: 'cooldown', start: FIRE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target' }] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: CRYSTAL_LASER_AI_RANGE,
        maxUsesPerRound: 1,
        priority: 50,
        ninjutsu: { ignore: true },
        roundWindow: { start: 0.05, end: 0.5 },
        canUse: (caster, ctx) =>
            Math.floor(ctx.gameTime / ROUND_DURATION) % CRYSTAL_LASER_ROUND_INTERVAL === 0 &&
            getBoundUnits(ctx.getUnits(), caster, COURT_CRYSTAL_ID).length >= 2,
    },
    getRange: () => ({ minRange: 0, maxRange: CRYSTAL_LASER_AI_RANGE }),
    getTooltipText(): string[] {
        return [
            'Enraged only. Stop time and draw every crystal into a wall, then fire one great laser for half a round',
            `Each ray stops on the first body it meets, dealing {${CRYSTAL_LASER_PULSE_DAMAGE}} damage every ${CRYSTAL_LASER_PULSE_SEC}s and pushing it back`,
            'A raised shield blocks the beam and protects everyone behind it',
            `Rock stops the beam but crumbles after ${(CRYSTAL_LASER_ROCK_HITS_TO_BREAK * CRYSTAL_LASER_PULSE_SEC).toFixed(1)}s of it`,
        ];
    },
});

export const CrystalLaserAbility_1490: AbilityStatic = {
    ..._base,

    /** Fix the wall slots and the tracked player once, so every client builds the same wall. */
    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as AbilityEngineContext;
        const t = targets[0];
        const aim = (t && resolveTargetToPoint(t, eng)) ?? { x: caster.x + 1, y: caster.y };
        const trackUnitId = t?.type === 'pixel' ? t.trackUnitId : t?.unitId;
        const count = getBoundUnits(eng.units, caster, COURT_CRYSTAL_ID).length;
        const slots = fitSlotsToTerrain(
            formationSlots(FORMATION_PRESETS.wallFacingTarget, count, { caster, target: aim }),
            eng.terrainManager,
        );
        const payload: CrystalLaserPayload = {
            ...(trackUnitId ? { trackUnitId } : {}),
            targetX: aim.x,
            targetY: aim.y,
            slots,
        };
        active.castPayload = payload;
    },

    /** Gathering rings during the freeze, then red sight-lines from the wall until the beam fires. */
    renderActivePreview(gr: IAbilityPreviewGraphics, caster: Unit, active: ActiveAbility, gameTime: number): void {
        const elapsed = getCastElapsedAt(active, gameTime);
        const payload = readCrystalLaserPayload(active);
        if (!payload || elapsed < 0 || elapsed >= AIM_END) return;
        if (elapsed < CRYSTAL_LASER_FREEZE_SEC) {
            const t = elapsed / CRYSTAL_LASER_FREEZE_SEC;
            gr.circle(caster.x, caster.y, 60 * (1 - t) + caster.radius);
            gr.stroke({ color: COURT_ORCHID, width: 2, alpha: 0.3 + 0.5 * t });
            for (const s of payload.slots) {
                gr.circle(s.x, s.y, 9);
                gr.fill({ color: COURT_VIOLET, alpha: 0.25 + 0.4 * t });
            }
            return;
        }
        const t = (elapsed - CRYSTAL_LASER_FREEZE_SEC) / CRYSTAL_LASER_AIM_SEC;
        let cx = 0;
        let cy = 0;
        for (const s of payload.slots) {
            cx += s.x;
            cy += s.y;
        }
        const n = Math.max(1, payload.slots.length);
        cx /= n;
        cy /= n;
        const ang = Math.atan2(payload.targetY - cy, payload.targetX - cx);
        const dx = Math.cos(ang) * CRYSTAL_LASER_LENGTH;
        const dy = Math.sin(ang) * CRYSTAL_LASER_LENGTH;
        for (const s of payload.slots) {
            gr.moveTo(s.x, s.y);
            gr.lineTo(s.x + dx, s.y + dy);
        }
        gr.stroke({ color: COURT_TELEGRAPH_RED, width: 1 + 2 * t, alpha: 0.25 + 0.6 * t });
    },
};

export const CrystalLaserCard_1490: CardDef = { abilityId: CRYSTAL_LASER_ABILITY_ID };
