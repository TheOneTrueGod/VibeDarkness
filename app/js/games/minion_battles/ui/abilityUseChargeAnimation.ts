/**
 * Builds discrete keyframes for ability use + recovery charge UI so we can
 * animate multi-step gains/losses (e.g. several charge ticks and rollovers)
 * over a fixed duration.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { RecoveryChargeType } from '../abilities/abilityUses';
import type { UnitAbilityRuntimeState } from '../game/units/Unit';

export const ABILITY_USE_CHARGE_ANIM_MS = 1000;

export interface ChargeAnimState {
    uses: number;
    charge: number;
    maxUses: number;
}

export interface AbilityChargeAnimRule {
    chargesPerRecovery: number;
    usesRecovered: number;
    chargeType: RecoveryChargeType;
}

export function snapshotChargeAnimState(
    runtime: UnitAbilityRuntimeState,
    rule: AbilityChargeAnimRule | undefined,
): ChargeAnimState {
    const maxUses = Math.max(1, runtime.maxUses);
    const uses = Math.max(0, Math.min(maxUses, runtime.currentUses));
    const N = Math.max(1, rule?.chargesPerRecovery ?? 1);
    const raw = rule ? (runtime.recoveryChargesByType[rule.chargeType] ?? 0) : 0;
    const charge = Math.max(0, Math.min(N, raw));
    return { uses, charge, maxUses };
}

/** One recovery charge application (same semantics as single-rule applyRecoveryChargeToAbility, +1 charge). */
export function simulateApplyOneCharge(prev: ChargeAnimState, N: number, usesRecovered: number): ChargeAnimState {
    const typeBuffer = Math.max(0, N - 1);
    let u = prev.uses;
    let c = prev.charge;
    const maxUses = Math.max(1, prev.maxUses);

    if (u >= maxUses) {
        const afterAdd = Math.min(typeBuffer + 1, c + 1);
        c = Math.min(typeBuffer, afterAdd);
        return { uses: u, charge: c, maxUses };
    }

    let currentCharge = Math.min(typeBuffer + 1, c + 1);
    const recoverSteps = Math.floor(currentCharge / N);
    if (recoverSteps > 0) {
        u = Math.min(maxUses, u + recoverSteps * usesRecovered);
        currentCharge -= recoverSteps * N;
    }
    c = currentCharge;
    if (u >= maxUses) {
        c = Math.min(typeBuffer, c);
    } else {
        c = Math.min(typeBuffer + N, c);
    }
    return { uses: u, charge: c, maxUses };
}

function statesEqual(a: ChargeAnimState, b: ChargeAnimState): boolean {
    return a.uses === b.uses && a.charge === b.charge && a.maxUses === b.maxUses;
}

/**
 * Keyframes from `prev` to `target` using spend-first, then charge-decrease,
 * then one-charge-at-a-time gains (with an injected "all segments full" frame before each rollover).
 */
export function buildChargeAnimFrames(
    prev: ChargeAnimState,
    target: ChargeAnimState,
    N: number,
    usesRecovered: number,
): ChargeAnimState[] {
    const n = Math.max(1, N);
    const ur = Math.max(1, usesRecovered);
    const frames: ChargeAnimState[] = [{ ...prev }];
    let cur = { ...prev };
    let guard = 0;

    while (!statesEqual(cur, target) && guard++ < 600) {
        if (cur.maxUses !== target.maxUses) {
            cur = { ...cur, maxUses: target.maxUses };
            frames.push({ ...cur });
            continue;
        }
        if (cur.uses > target.uses) {
            cur = { ...cur, uses: cur.uses - 1 };
            frames.push({ ...cur });
            continue;
        }
        if (cur.uses === target.uses && cur.charge > target.charge) {
            cur = { ...cur, charge: cur.charge - 1 };
            frames.push({ ...cur });
            continue;
        }

        const next = simulateApplyOneCharge(cur, n, ur);
        if (statesEqual(next, cur)) {
            if (!statesEqual(cur, target)) {
                frames.push({ ...target });
            }
            break;
        }

        const rolled = next.uses > cur.uses && cur.charge === n - 1;
        if (rolled) {
            frames.push({ ...cur, charge: n });
        }
        frames.push({ ...next });
        cur = { ...next };
    }

    return frames;
}

export type ChargeTransitionKind = 'fill' | 'drain' | 'rollover' | 'usesDown' | 'usesUp' | 'snap';

export function getChargeTransitionKind(from: ChargeAnimState, to: ChargeAnimState, N: number): ChargeTransitionKind {
    const n = Math.max(1, N);
    if (to.uses < from.uses && to.charge === from.charge) return 'usesDown';
    if (to.uses > from.uses && to.charge === from.charge) return 'usesUp';
    if (to.charge === from.charge - 1 && to.uses === from.uses) return 'drain';
    if (to.charge === from.charge + 1 && to.uses === from.uses) return 'fill';
    if (from.charge === n && to.charge === 0 && to.uses > from.uses) return 'rollover';
    return 'snap';
}

function easeOutCubic(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return 1 - (1 - x) ** 3;
}

/** When an ability has no recovery row, animate use count changes only. */
export function buildUsesOnlyAnimFrames(prev: ChargeAnimState, target: ChargeAnimState): ChargeAnimState[] {
    const a: ChargeAnimState = { uses: prev.uses, charge: 0, maxUses: prev.maxUses };
    const b: ChargeAnimState = { uses: target.uses, charge: 0, maxUses: target.maxUses };
    if (statesEqual(a, b)) return [a];
    const frames: ChargeAnimState[] = [{ ...a }];
    let cur = { ...a };
    let guard = 0;
    while (!statesEqual(cur, b) && guard++ < 200) {
        if (cur.maxUses !== b.maxUses) {
            cur = { ...cur, maxUses: b.maxUses };
            frames.push({ ...cur });
            continue;
        }
        if (cur.uses > b.uses) {
            cur = { ...cur, uses: cur.uses - 1 };
        } else {
            cur = { ...cur, uses: cur.uses + 1 };
        }
        frames.push({ ...cur });
    }
    return frames;
}

export function staticChargeAnimDisplay(target: ChargeAnimState, n: number): AnimatedChargeDisplay {
    const cap = Math.max(1, n);
    return {
        uses: target.uses,
        maxUses: target.maxUses,
        chargeFloor: Math.min(cap, target.charge),
        fillingSegmentIndex: null,
        fillProgress: 0,
        drainingSegmentIndex: null,
        drainProgress: 0,
    };
}

export interface AnimatedChargeDisplay {
    uses: number;
    maxUses: number;
    /** Integer charge count for fully filled segments (0..N). */
    chargeFloor: number;
    /** Segment index receiving a partial fill (0..N-1), or null. */
    fillingSegmentIndex: number | null;
    fillProgress: number;
    drainingSegmentIndex: number | null;
    drainProgress: number;
}

/**
 * Maps elapsed time into display values for one row of recovery + uses text.
 */
export function computeAnimatedChargeDisplay(
    frames: ChargeAnimState[],
    elapsedMs: number,
    totalDurationMs: number,
    N: number,
): AnimatedChargeDisplay {
    const n = Math.max(1, N);
    const last = frames[frames.length - 1] ?? { uses: 0, charge: 0, maxUses: 1 };
    if (frames.length < 2 || totalDurationMs <= 0) {
        return {
            uses: last.uses,
            maxUses: last.maxUses,
            chargeFloor: Math.min(n, last.charge),
            fillingSegmentIndex: null,
            fillProgress: 0,
            drainingSegmentIndex: null,
            drainProgress: 0,
        };
    }

    const transitions = frames.length - 1;
    const durPer = totalDurationMs / transitions;
    const clampedElapsed = Math.max(0, Math.min(totalDurationMs, elapsedMs));
    const tIdx = Math.min(transitions - 1, Math.floor(clampedElapsed / durPer));
    const localRaw = durPer > 0 ? (clampedElapsed - tIdx * durPer) / durPer : 1;
    const localT = Math.max(0, Math.min(1, localRaw));
    const eased = easeOutCubic(localT);

    const from = frames[tIdx] ?? last;
    const to = frames[tIdx + 1] ?? last;
    const kind = getChargeTransitionKind(from, to, n);

    const base: AnimatedChargeDisplay = {
        uses: to.uses,
        maxUses: to.maxUses,
        chargeFloor: Math.min(n, to.charge),
        fillingSegmentIndex: null,
        fillProgress: 0,
        drainingSegmentIndex: null,
        drainProgress: 0,
    };

    if (kind === 'fill') {
        return {
            uses: from.uses,
            maxUses: from.maxUses,
            chargeFloor: Math.min(n, from.charge),
            fillingSegmentIndex: Math.max(0, to.charge - 1),
            fillProgress: eased,
            drainingSegmentIndex: null,
            drainProgress: 0,
        };
    }

    if (kind === 'drain') {
        return {
            uses: from.uses,
            maxUses: from.maxUses,
            chargeFloor: Math.min(n, to.charge),
            fillingSegmentIndex: null,
            fillProgress: 0,
            drainingSegmentIndex: Math.max(0, from.charge - 1),
            drainProgress: 1 - eased,
        };
    }

    if (kind === 'rollover') {
        const secondHalf = localT >= 0.5;
        return {
            uses: secondHalf ? to.uses : from.uses,
            maxUses: secondHalf ? to.maxUses : from.maxUses,
            chargeFloor: secondHalf ? Math.min(n, to.charge) : Math.min(n, from.charge),
            fillingSegmentIndex: null,
            fillProgress: 0,
            drainingSegmentIndex: null,
            drainProgress: 0,
        };
    }

    if (kind === 'usesDown') {
        return {
            uses: localT >= 0.5 ? to.uses : from.uses,
            maxUses: to.maxUses,
            chargeFloor: Math.min(n, to.charge),
            fillingSegmentIndex: null,
            fillProgress: 0,
            drainingSegmentIndex: null,
            drainProgress: 0,
        };
    }

    if (kind === 'usesUp') {
        return {
            uses: localT >= 0.5 ? to.uses : from.uses,
            maxUses: to.maxUses,
            chargeFloor: Math.min(n, to.charge),
            fillingSegmentIndex: null,
            fillProgress: 0,
            drainingSegmentIndex: null,
            drainProgress: 0,
        };
    }

    return base;
}

/**
 * Animates uses + recovery charge segments over {@link ABILITY_USE_CHARGE_ANIM_MS} when runtime changes.
 * Respects `prefers-reduced-motion: reduce` (snaps to target).
 */
export function useAbilityUseChargeAnimation(
    abilityId: string,
    runtime: UnitAbilityRuntimeState,
    rule: AbilityChargeAnimRule | undefined,
): AnimatedChargeDisplay & { isAnimating: boolean } {
    const N = Math.max(1, rule?.chargesPerRecovery ?? 1);
    const chargeType = rule?.chargeType ?? 'staminaCharge';
    const chargeVal = rule ? (runtime.recoveryChargesByType[chargeType] ?? 0) : 0;
    const targetSig = `${abilityId}|${runtime.currentUses}|${chargeVal}|${runtime.maxUses}`;

    const target = snapshotChargeAnimState(runtime, rule);
    const [display, setDisplay] = useState<AnimatedChargeDisplay>(() => staticChargeAnimDisplay(target, N));
    const [isAnimating, setIsAnimating] = useState(false);
    const committedRef = useRef<ChargeAnimState>(target);
    const runtimeRef = useRef(runtime);
    runtimeRef.current = runtime;
    const ruleRef = useRef(rule);
    ruleRef.current = rule;
    const prevAbilityIdRef = useRef(abilityId);

    useLayoutEffect(() => {
        if (prevAbilityIdRef.current !== abilityId) {
            prevAbilityIdRef.current = abilityId;
            const t = snapshotChargeAnimState(runtimeRef.current, ruleRef.current);
            committedRef.current = t;
            const animN = Math.max(1, ruleRef.current?.chargesPerRecovery ?? 1);
            setDisplay(staticChargeAnimDisplay(t, animN));
            setIsAnimating(false);
            return;
        }

        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const nextTarget = snapshotChargeAnimState(runtimeRef.current, ruleRef.current);
        if (statesEqual(committedRef.current, nextTarget)) {
            return;
        }

        const animN = Math.max(1, ruleRef.current?.chargesPerRecovery ?? 1);
        const frames = ruleRef.current
            ? buildChargeAnimFrames(
                  committedRef.current,
                  nextTarget,
                  animN,
                  Math.max(1, ruleRef.current.usesRecovered),
              )
            : buildUsesOnlyAnimFrames(committedRef.current, nextTarget);

        if (reduced || frames.length < 2) {
            committedRef.current = nextTarget;
            setDisplay(staticChargeAnimDisplay(nextTarget, animN));
            setIsAnimating(false);
            return;
        }

        setIsAnimating(true);
        const startMs = performance.now();
        let raf = 0;

        const tick = (now: number) => {
            const elapsed = now - startMs;
            const latest = snapshotChargeAnimState(runtimeRef.current, ruleRef.current);
            if (!statesEqual(latest, nextTarget)) {
                committedRef.current = latest;
                setDisplay(staticChargeAnimDisplay(latest, animN));
                setIsAnimating(false);
                return;
            }
            if (elapsed >= ABILITY_USE_CHARGE_ANIM_MS) {
                committedRef.current = latest;
                setDisplay(staticChargeAnimDisplay(latest, animN));
                setIsAnimating(false);
                return;
            }
            setDisplay(computeAnimatedChargeDisplay(frames, elapsed, ABILITY_USE_CHARGE_ANIM_MS, animN));
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            const latest = snapshotChargeAnimState(runtimeRef.current, ruleRef.current);
            committedRef.current = latest;
            setDisplay(staticChargeAnimDisplay(latest, animN));
            setIsAnimating(false);
        };
    }, [abilityId, targetSig, N]);

    return { ...display, isAnimating };
}
