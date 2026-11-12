/**
 * Claw combo: a fast three-beat melee (swipe left, swipe right, then both claws raked in a crossing X)
 * built from one aim-frame segment claw and its mirror. Strikes two and three are re-aimed on their own
 * but may only turn a little from the previous strike (`SelectTargetDef.turnLimit`); every strike steps
 * toward its own target first (step lunge) and slides a little into the hit.
 *
 * Everything that differs between claw cards is data on {@link ClawComboConfig}: the claw's shape, damage,
 * pacing, lunges, what runs as the first swipe opens (an HP payment, say) and the slash's look
 * ({@link ClawSlashStyle}). Bloody Claws (0306) and Ice Claws (1501) are both built from it.
 */

import { AbilityPhase, type AbilityTimingInterval } from './abilityTimings';
import type { CastBehaviour, CastBehaviourEntry, CastBehaviourTickContext } from './castBehaviourTypes';
import { CastBehaviours } from './CastBehaviours';
import type { SelectTargetDef } from './timingTargetDef';
import { aimFrameSegmentHitbox, type AimFramePoint, type AimFrameSegmentHitboxSpec } from '../hitboxes';
import { Effect } from '../game/effects/Effect';
import { CLAW_SLASH_EFFECT_TYPE, type ClawSlashEffectData } from '../game/effect_defs/clawSlashEffects';
import { hashMoteSeed, moteBurst, moteRng, motesAlongSegment, type MoteSpec } from '../game/effects/motes';
import type { Unit } from '../game/units/Unit';

/** Seconds into the cast. Each strike window opens before its impact so the step lunge reads. */
export interface ClawComboTimings {
    readonly windupEnd: number;
    readonly swipeLeftImpact: number;
    readonly swipeLeftEnd: number;
    readonly swipeRightStart: number;
    readonly swipeRightImpact: number;
    readonly swipeRightEnd: number;
    readonly xStrikeStart: number;
    readonly xStrikeImpact: number;
    readonly xStrikeEnd: number;
    readonly cooldownEnd: number;
}

/** What a claw's slash looks like when it strikes. Every field is optional; the default is the red ClawSlash. */
export interface ClawSlashStyle {
    /** Wide under-stroke colour of each streak (`ClawSlashEffectData.glowColor`). */
    glowColor?: number;
    /** Thin bright streak colour (`ClawSlashEffectData.coreColor`). */
    coreColor?: number;
    /** Parallel streaks per claw. Default 3. */
    fingers?: number;
    /** Gap between streaks (px). Default 4. */
    spacing?: number;
    /** Seconds the slash is drawn. Default 0.22. */
    durationSec?: number;
    /** Motes laid along the claw as it strikes (`motesAlongSegment`). */
    trail?: { spec: MoteSpec; count: number; jitterPx?: number };
    /** Motes burst out of each unit the claw hits (`moteBurst`). */
    hitBurst?: { spec: MoteSpec; count: number; radiusPx?: number };
}

export interface ClawComboConfig {
    /** The left claw ("/") in the caster's aim frame; the right claw is its mirror. */
    base: AimFramePoint;
    tip: AimFramePoint;
    halfThickness: number;
    targetsPerClaw: number;
    damage: number;
    /** Strikes two and three may turn this far either side of the previous strike's aim. */
    maxTurnDegrees: number;
    /** Step lunges (real movement, px): the first swipe closes more distance than the follow-ups. */
    firstStrikeLunge: number;
    followUpLunge: number;
    /** Seconds each step lunge takes; finish it by the strike's impact. */
    lungeDuration: number;
    /** Drawn slide on top of the step (no movement): ease forward into the hit, settle behind. */
    strikeSlide: { forwardDistance: number; backwardDistance: number };
    timings: ClawComboTimings;
    /** Behaviours run once as the first swipe opens (e.g. `payHpCostBehaviour`). */
    firstStrikeStart?: CastBehaviour[];
    slash?: ClawSlashStyle;
}

export interface ClawCombo {
    leftClaw: AimFrameSegmentHitboxSpec;
    rightClaw: AimFrameSegmentHitboxSpec;
    abilityTimings: AbilityTimingInterval[];
    /** AI reach: the claw plus the first strike's step lunge. */
    aiMaxRange: number;
}

/** Select labels of the three strikes (also the keys of `ActiveAbility.targetsByLabel`). */
export const CLAW_COMBO_LABELS = {
    swipeLeft: 'Swipe left',
    swipeRight: 'Swipe right',
    xStrike: 'X strike',
} as const;

const DEFAULT_SLASH_DURATION = 0.22;
const NO_SLIDE = { forwardDistance: 0, backwardDistance: 0 };

/** Where `impact` falls within the strike window `[start, end)`, as window progress (0-1). */
function impactProgress(start: number, impact: number, end: number): number {
    return (impact - start) / (end - start);
}

/** The slash streaks sweeping base -> tip along the claw that just struck, plus any trail and hit motes. */
function spawnClawSlash(hitbox: AimFrameSegmentHitboxSpec, style: ClawSlashStyle) {
    return (ctx: CastBehaviourTickContext, hitUnits: Unit[], aimX: number, aimY: number): void => {
        const seg = hitbox.getSegment(ctx.caster, { x: aimX, y: aimY });
        const data: ClawSlashEffectData = {
            dx: seg.x1 - seg.x0,
            dy: seg.y1 - seg.y0,
            fingers: style.fingers ?? 3,
            spacing: style.spacing ?? 4,
            ...(style.glowColor !== undefined ? { glowColor: style.glowColor } : {}),
            ...(style.coreColor !== undefined ? { coreColor: style.coreColor } : {}),
        };
        ctx.engine.addEffect(new Effect({
            x: seg.x0,
            y: seg.y0,
            duration: style.durationSec ?? DEFAULT_SLASH_DURATION,
            effectType: CLAW_SLASH_EFFECT_TYPE,
            effectData: { ...data },
        }));
        if (!style.trail && !style.hitBurst) return;
        // Render-only motes: a local seeded RNG, never the engine's.
        const rand = moteRng(hashMoteSeed(`${ctx.caster.id}:${ctx.abilityId}:${ctx.engine.gameTick}:${seg.x0.toFixed(1)}`));
        const motes: Effect[] = [];
        if (style.trail) {
            const { spec, count, jitterPx } = style.trail;
            motes.push(...motesAlongSegment(seg.x0, seg.y0, seg.x1, seg.y1, spec, count, rand, jitterPx ?? 0));
        }
        if (style.hitBurst) {
            const { spec, count, radiusPx } = style.hitBurst;
            for (const unit of hitUnits) motes.push(...moteBurst(unit.x, unit.y, spec, count, rand, radiusPx ?? unit.radius * 0.5));
        }
        for (const mote of motes) ctx.engine.addEffect(mote);
    };
}

/** Build a claw combo's hitboxes and timing table from data. */
export function buildClawCombo(config: ClawComboConfig): ClawCombo {
    const T = config.timings;
    const slash = config.slash ?? {};
    const leftClaw = aimFrameSegmentHitbox({
        from: config.base,
        to: config.tip,
        halfThickness: config.halfThickness,
        numTargets: config.targetsPerClaw,
    });
    const rightClaw = leftClaw.mirrored();

    /** `slide: false` for a second claw in the same window, so the caster's drawn slide is not doubled. */
    const claw = (hitbox: AimFrameSegmentHitboxSpec, opts: { impactAt: number; slide?: boolean }) =>
        CastBehaviours.MeleeAttack()
            .withHitbox(hitbox)
            .withDamage(config.damage)
            // Each strike has its own select step; never borrow another strike's lock-ons or aim.
            .withOwnTargetOnly()
            .withImpactAt(opts.impactAt)
            .withSlide(opts.slide === false ? NO_SLIDE : config.strikeSlide)
            .withImpactVFX(spawnClawSlash(hitbox, slash));

    const strike = (...behaviours: CastBehaviour[]): CastBehaviourEntry[] =>
        behaviours.map((behaviour) => ({ timingStart: 'start', timingEnd: 'end', behaviour }));

    const clawSelect = (
        label: string,
        hitbox: AimFrameSegmentHitboxSpec,
        opts: { lunge: number; turnFrom?: string; companion?: AimFrameSegmentHitboxSpec },
    ): SelectTargetDef => ({
        kind: 'select',
        label,
        hitbox,
        filter: 'enemy',
        allowMiss: true,
        lunge: { distance: opts.lunge, duration: config.lungeDuration },
        ...(opts.turnFrom ? { turnLimit: { fromLabel: opts.turnFrom, maxDegrees: config.maxTurnDegrees } } : {}),
        // The second claw strikes whether or not the first finds a target.
        ...(opts.companion ? { companionHitboxes: [{ hitbox: opts.companion, independent: true }] } : {}),
    });

    const L = CLAW_COMBO_LABELS;
    const xStrikeImpactAt = impactProgress(T.xStrikeStart, T.xStrikeImpact, T.xStrikeEnd);
    const abilityTimings: AbilityTimingInterval[] = [
        { id: 'windup', start: 0, end: T.windupEnd, abilityPhase: AbilityPhase.Windup },
        {
            id: 'swipe_left',
            start: T.windupEnd,
            end: T.swipeLeftEnd,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            timelineLabel: L.swipeLeft,
            targetDef: clawSelect(L.swipeLeft, leftClaw, { lunge: config.firstStrikeLunge }),
            castBehaviours: [
                ...(config.firstStrikeStart ?? []).map((behaviour): CastBehaviourEntry => ({ timingStart: 'start', behaviour })),
                ...strike(claw(leftClaw, { impactAt: impactProgress(T.windupEnd, T.swipeLeftImpact, T.swipeLeftEnd) })),
            ],
        },
        { id: 'gap_1', start: T.swipeLeftEnd, end: T.swipeRightStart, abilityPhase: AbilityPhase.Waiting, timelineLabel: 'Between swipes' },
        {
            id: 'swipe_right',
            start: T.swipeRightStart,
            end: T.swipeRightEnd,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: L.swipeRight,
            targetDef: clawSelect(L.swipeRight, rightClaw, { lunge: config.followUpLunge, turnFrom: L.swipeLeft }),
            castBehaviours: strike(
                claw(rightClaw, { impactAt: impactProgress(T.swipeRightStart, T.swipeRightImpact, T.swipeRightEnd) }),
            ),
        },
        { id: 'gap_2', start: T.swipeRightEnd, end: T.xStrikeStart, abilityPhase: AbilityPhase.Waiting, timelineLabel: 'Between swipes' },
        {
            id: 'x_strike',
            start: T.xStrikeStart,
            end: T.xStrikeEnd,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: L.xStrike,
            targetDef: clawSelect(L.xStrike, leftClaw, {
                lunge: config.followUpLunge,
                turnFrom: L.swipeRight,
                companion: rightClaw,
            }),
            // Two independent claws: a unit where they cross is hit by both. The right claw is the
            // select's companion hitbox, so it tethers the companion lock-ons, not the left claw's.
            castBehaviours: strike(
                claw(leftClaw, { impactAt: xStrikeImpactAt }),
                claw(rightClaw, { impactAt: xStrikeImpactAt, slide: false }).withLockOnRole('companion'),
            ),
        },
        { id: 'cooldown', start: T.xStrikeEnd, end: T.cooldownEnd, abilityPhase: AbilityPhase.Cooldown },
    ];

    return { leftClaw, rightClaw, abilityTimings, aiMaxRange: leftClaw.maxRange + config.firstStrikeLunge };
}
