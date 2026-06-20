import type { Unit } from '../../game/units/Unit';
import type { HitboxEngineContext } from '../../hitboxes/Hitbox';
import { Effect } from '../../game/effects/Effect';
import type { HitboxDef } from '../hitboxDef';
import { resolveHitbox } from '../hitboxDef';
import type { HitboxSpec } from '../../hitboxes/HitboxSpec';
import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
    CastBehaviourInterruptContext,
    CastBehaviourBaseContext,
    CastBehaviourRenderContext,
} from '../castBehaviourTypes';
import type { ResolvedTarget } from '../../game/types';
import { BaseAttackBehaviour } from './BaseAttackBehaviour';
import type { TryDamageOrBlockParams } from '../blockingHelpers';
import { getLockOnRange as getLockOnRangeFromMax } from '../targetLockTracking';
import { resolveMeleeSlideDirection } from '../meleeSlideDirection';

// ---- Easing (melee lunge slide) ----

function easeOutCubic(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return 1 - (1 - clamped) ** 3;
}

function easeInOutQuad(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - ((-2 * clamped + 2) ** 2) / 2;
}

/**
 * Returns the effective max range for pixel-target clamping.
 * Returns null when the hitbox has no meaningful range (custom shape or absent).
 */
function getHitboxMaxRange(def: HitboxDef | HitboxSpec | null): number | null {
    if (def === null) return null;
    // HitboxSpec exposes .maxRange directly.
    if ('maxRange' in def) return def.maxRange;
    // HitboxDef plain-object: custom/cone shapes and circle 'caster' range have no fixed pixel range.
    if (def.shape === 'custom' || def.shape === 'cone') return null;
    if (def.range === 'caster') return null;
    return def.range;
}

function getLockOnRange(def: HitboxDef | HitboxSpec | null): number {
    if (def === null) return getLockOnRangeFromMax(null);
    if ('maxRange' in def) return getLockOnRangeFromMax(def.maxRange);
    if (def.shape === 'custom') return getLockOnRangeFromMax(null);
    if (def.range === 'caster') return getLockOnRangeFromMax(null);
    return getLockOnRangeFromMax(def.range);
}

// ---- Payload ----

interface LockedUnit {
    unitId: string;
}

interface MeleeAttackPayload {
    aimDirX: number;
    aimDirY: number;
    /**
     * Original click world position, appended by the UI for multi-target HitboxSpec abilities.
     * When set, `onTick` uses it as the aim point instead of the locked-on unit's live position,
     * so the perpendicular bar keeps the angle the player intended even if units shift slightly.
     */
    aimPixel: { x: number; y: number } | null;
    lockedUnits: LockedUnit[];
    /**
     * Unit IDs that have successfully evaded this attack. These units are excluded from
     * hitbox hits even if they overlap the impact area, because the aim-point is now at
     * the frozen pixel position (already stored in active.targets via unitAbilityTick).
     */
    evadedUnitIds: Set<string>;
    interrupted: boolean;
    impactFired: boolean;
}

// ---- Stack-aware hit-slot assignment ----

/**
 * Assign up to `cap` hit slots to candidates. Each unique unit gets one slot
 * first (preserving order). Remaining slots are given to stacks (largest
 * first, capped by stackSize), so a single stack can be hit multiple times
 * when there are not enough distinct targets to fill all slots.
 *
 * Prefer spreading hits across different stacks before hitting the same stack
 * twice.
 */
function assignHitSlots(candidates: Unit[], cap: number): Unit[] {
    const slotsUsed = new Map<string, number>();
    const result: Unit[] = [];

    for (const u of candidates) {
        if (result.length >= cap) break;
        if (!slotsUsed.has(u.id)) {
            slotsUsed.set(u.id, 1);
            result.push(u);
        }
    }

    if (result.length < cap) {
        const stackable = [...new Set(candidates)]
            .filter((u) => u.stackSize > (slotsUsed.get(u.id) ?? 0))
            .sort((a, b) => b.stackSize - a.stackSize);

        for (const u of stackable) {
            while (result.length < cap && (slotsUsed.get(u.id) ?? 0) < u.stackSize) {
                slotsUsed.set(u.id, (slotsUsed.get(u.id) ?? 0) + 1);
                result.push(u);
            }
            if (result.length >= cap) break;
        }
    }

    return result;
}

// ---- Behaviour class ----

export class MeleeAttackBehaviour extends BaseAttackBehaviour implements CastBehaviour {
    private hitboxDef: HitboxDef | HitboxSpec | null = null;
    private impactEffectType: string = 'punch';
    private impactVFXCallback: ((ctx: CastBehaviourTickContext, hitUnits: Unit[], aimX: number, aimY: number) => void) | null = null;
    private impactAt: number = 0.4;
    private slideConfig = { forwardDistance: 12, backwardDistance: 0 };
    private maxHits: number = 1;
    /**
     * When set, overrides the hitbox-derived lock-on range for guaranteed hits.
     * Runtime range = caster.radius + target.radius + lockOnExtraOverride.
     * Use withLockOnExtra() for basic attacks where the default 100px tether is too generous.
     */
    private lockOnExtraOverride: number | null = null;

    withHitbox(def: HitboxDef | HitboxSpec): this {
        this.hitboxDef = def;
        return this;
    }

    withImpact(effectType: string): this {
        this.impactEffectType = effectType;
        return this;
    }

    withDamage(amount: number, opts?: { attackType?: TryDamageOrBlockParams['attackType'] }): this;
    withDamage(resolver: (ctx: CastBehaviourTickContext, unit: Unit) => number, opts?: { attackType?: TryDamageOrBlockParams['attackType'] }): this;
    withDamage(
        amountOrResolver: number | ((ctx: CastBehaviourTickContext, unit: Unit) => number),
        opts?: { attackType?: TryDamageOrBlockParams['attackType'] },
    ): this {
        if (typeof amountOrResolver === 'number') {
            this.setDeclarativeDamage(amountOrResolver, opts?.attackType ?? 'melee');
        } else {
            this.setDeclarativeDamageResolver(amountOrResolver, opts?.attackType ?? 'melee');
        }
        return this;
    }

    withImpactAt(progress: number): this {
        this.impactAt = progress;
        return this;
    }

    /**
     * Override the default point-impact VFX with a custom spawner.
     * Called at impact time regardless of whether any units were hit.
     * `aimX/aimY` is the resolved aim point (already clamped to hitbox range).
     */
    withImpactVFX(
        fn: (ctx: CastBehaviourTickContext, hitUnits: Unit[], aimX: number, aimY: number) => void,
    ): this {
        this.impactVFXCallback = fn;
        return this;
    }

    withSlide(cfg: { forwardDistance: number; backwardDistance: number }): this {
        this.slideConfig = cfg;
        return this;
    }

    // How many targets to lock on to (starting from the behaviour's targetIndex slot).
    withMaxHits(n: number): this {
        this.maxHits = n;
        return this;
    }

    withLockOnExtra(px: number): this {
        this.lockOnExtraOverride = px;
        return this;
    }

    private getNumLockOns(): number {
        return (this.hitboxDef && 'numTargets' in this.hitboxDef)
            ? (this.hitboxDef as HitboxSpec).numTargets
            : this.maxHits;
    }

    /**
     * World-space unit direction for the caster lunge slide.
     * Single-target timings use `ctx.target` only; multi-lock swings may use the UI aim pixel.
     */
    private resolveSlideDirection(ctx: {
        caster: Unit;
        target: ResolvedTarget;
        allTargets: ResolvedTarget[];
        engine: CastBehaviourSetupContext['engine'];
    }): { dirX: number; dirY: number } {
        return resolveMeleeSlideDirection({
            caster: ctx.caster,
            target: ctx.target,
            allTargets: ctx.allTargets,
            numLockOns: this.getNumLockOns(),
            getUnit: (id) => ctx.engine.getUnit(id),
        });
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const numLockOns = this.getNumLockOns();

        // Collect locked units starting at the primary target's slot, up to numLockOns.
        const startIdx = Math.max(0, ctx.allTargets.indexOf(ctx.target));
        const lockedUnits: LockedUnit[] = [];
        for (let i = startIdx; i < Math.min(ctx.allTargets.length, startIdx + numLockOns); i++) {
            const t = ctx.allTargets[i];
            if (t?.type === 'unit' && t.unitId != null) {
                lockedUnits.push({ unitId: t.unitId });
            }
        }

        // For multi-target HitboxSpec abilities, the UI appends the original click world
        // position as a pixel entry after all unit lock-ons. Find it here so onTick can
        // use it to preserve the player's intended swing direction rather than drifting
        // toward the locked-on unit's live position.
        let aimPixel: { x: number; y: number } | null = null;
        if (numLockOns > 1) {
            const aimPixelTarget = ctx.allTargets.slice(startIdx + numLockOns).find(t => t.type === 'pixel');
            aimPixel = (aimPixelTarget?.type === 'pixel' && aimPixelTarget.position != null)
                ? aimPixelTarget.position
                : null;
        }

        const { dirX: aimDirX, dirY: aimDirY } = this.resolveSlideDirection(ctx);

        const payload: MeleeAttackPayload = {
            aimDirX,
            aimDirY,
            aimPixel,
            lockedUnits,
            evadedUnitIds: new Set<string>(),
            interrupted: false,
            impactFired: false,
        };
        ctx.setBehaviourPayload(payload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload || payload.interrupted || payload.impactFired) return;

        // impactAt = 0 fires on the very first tick (can't use < 0 comparison).
        const crossedImpact = this.impactAt <= 0
            ? ctx.isFirstTick
            : ctx.prevWindowProgress < this.impactAt && ctx.windowProgress >= this.impactAt;
        if (!crossedImpact) return;

        ctx.setBehaviourPayload({ ...payload, impactFired: true });

        // Resolve aim point (used for hitbox direction and fallback VFX).
        // Priority: explicit aim pixel stored at cast time → live unit position → pixel target → fallback.
        // The aim pixel is appended by the UI for multi-target HitboxSpec abilities so the swing
        // bar keeps the player's original click angle rather than drifting with the primary unit.
        let aimX: number;
        let aimY: number;
        if (payload.aimPixel) {
            // Clamp to hitbox range so the bar centre stays within the displayed area.
            const clampRange = getHitboxMaxRange(this.hitboxDef);
            if (clampRange !== null) {
                const dx = payload.aimPixel.x - ctx.caster.x;
                const dy = payload.aimPixel.y - ctx.caster.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const factor = dist > 0 ? Math.min(1, clampRange / dist) : 1;
                aimX = ctx.caster.x + dx * factor;
                aimY = ctx.caster.y + dy * factor;
            } else {
                aimX = payload.aimPixel.x;
                aimY = payload.aimPixel.y;
            }
        } else if (ctx.target.type === 'unit' && ctx.target.unitId != null) {
            // active.targets is now the single source of truth: if the target evaded or died,
            // unitAbilityTick has already downgraded this entry to a pixel target before onTick fires.
            const liveUnit = ctx.engine.getUnit(ctx.target.unitId);
            if (liveUnit) {
                aimX = liveUnit.x;
                aimY = liveUnit.y;
            } else {
                const FALLBACK_DIST = 64;
                aimX = ctx.caster.x + payload.aimDirX * FALLBACK_DIST;
                aimY = ctx.caster.y + payload.aimDirY * FALLBACK_DIST;
            }
        } else if (ctx.target.type === 'pixel' && ctx.target.position != null) {
            // Clamp pixel targets to hitbox range so the miss VFX and hitbox check stay
            // within the displayed preview area rather than at the raw (potentially distant)
            // click position.
            const clampRange = getHitboxMaxRange(this.hitboxDef);
            if (clampRange !== null) {
                const dx = ctx.target.position.x - ctx.caster.x;
                const dy = ctx.target.position.y - ctx.caster.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const factor = dist > 0 ? Math.min(1, clampRange / dist) : 1;
                aimX = ctx.caster.x + dx * factor;
                aimY = ctx.caster.y + dy * factor;
            } else {
                aimX = ctx.target.position.x;
                aimY = ctx.target.position.y;
            }
        } else {
            const FALLBACK_DIST = 64;
            aimX = ctx.caster.x + payload.aimDirX * FALLBACK_DIST;
            aimY = ctx.caster.y + payload.aimDirY * FALLBACK_DIST;
        }

        // --- Guaranteed hits: locked units still within lock-on range ---
        // Evaded units (lockedPosition set) are excluded — they dodged intentionally.
        // When lockOnExtraOverride is set, the range is caster.radius + target.radius + extra
        // (computed per-target so differently-sized units are handled correctly).
        const defaultLockOnRange = getLockOnRange(this.hitboxDef);
        const guaranteedHitIds = new Set<string>();
        const guaranteedHits: Unit[] = [];

        for (const locked of payload.lockedUnits) {
            if (payload.evadedUnitIds.has(locked.unitId)) continue; // evaded
            const liveUnit = ctx.engine.getUnit(locked.unitId);
            if (!liveUnit || !liveUnit.isAlive()) continue;
            const lockOnRange = this.lockOnExtraOverride !== null
                ? ctx.caster.radius + liveUnit.radius + this.lockOnExtraOverride
                : defaultLockOnRange;
            const dx = liveUnit.x - ctx.caster.x;
            const dy = liveUnit.y - ctx.caster.y;
            if (Math.sqrt(dx * dx + dy * dy) <= lockOnRange) {
                guaranteedHits.push(liveUnit);
                guaranteedHitIds.add(locked.unitId);
            }
        }

        // --- Hitbox check fills any remaining slots ---
        let hitboxUnits: Unit[] = [];
        if (this.hitboxDef != null) {
            if ('maxRange' in this.hitboxDef) {
                // HitboxSpec path — delegate to spec's resolveHits.
                hitboxUnits = this.hitboxDef.resolveHits(
                    ctx.engine as unknown as HitboxEngineContext,
                    ctx.caster,
                    aimX,
                    aimY,
                );
            } else {
                hitboxUnits = resolveHitbox(this.hitboxDef, {
                    engine: ctx.engine as unknown as HitboxEngineContext,
                    caster: ctx.caster,
                    originX: ctx.caster.x,
                    originY: ctx.caster.y,
                    aimX,
                    aimY,
                });
            }
        }

        // Evaded units are excluded from all hits — the attack targets the floor at the evade
        // snapshot position, not the unit itself, so even a hitbox overlap should not apply damage.
        const evadedIds = payload.evadedUnitIds;

        // Final list: stack-aware slot assignment (stacks may appear multiple times).
        const allCandidates: Unit[] = [...guaranteedHits];
        for (const u of hitboxUnits) {
            if (!guaranteedHitIds.has(u.id) && !evadedIds.has(u.id)) {
                allCandidates.push(u);
            }
        }

        const hitUnits: Unit[] =
            this.hitboxDef != null && 'maxRange' in this.hitboxDef
                ? assignHitSlots(allCandidates, (this.hitboxDef as HitboxSpec).numTargets)
                : allCandidates;

        // Spawn impact VFX — custom callback takes full control when set.
        // Only animate from caster when the attack actually lands; misses and evades appear in place.
        if (this.impactVFXCallback) {
            this.impactVFXCallback(ctx, hitUnits, aimX, aimY);
        } else {
            ctx.engine.addEffect(new Effect({
                x: aimX,
                y: aimY,
                duration: 0.2,
                effectType: this.impactEffectType,
                ...(hitUnits.length > 0 ? { startX: ctx.caster.x, startY: ctx.caster.y } : {}),
            }));
        }

        // Apply damage via the declarative path.
        if (hitUnits.length > 0) {
            this.runDeclarativeDamage(hitUnits, ctx);
        }

        // Apply tier-based knockback (if configured via withKnockback).
        this.applyKnockbackToHits(hitUnits, ctx);

        // Hit pause.
        ctx.engine.requestHitPause?.(3);
    }

    onInterrupt(ctx: CastBehaviourInterruptContext): void {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload) return;
        ctx.setBehaviourPayload({ ...payload, interrupted: true });
    }

    onTargetEvade(
        unitId: string,
        snapshot: { x: number; y: number },
        ctx: CastBehaviourBaseContext,
    ): void {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload) return;
        const isLocked = payload.lockedUnits.some(lu => lu.unitId === unitId);
        if (!isLocked || payload.evadedUnitIds.has(unitId)) return;

        // Mark this unit as evaded — it will be excluded from guaranteed hits and hitbox hits.
        // active.targets has already been downgraded to a pixel target by unitAbilityTick.
        payload.evadedUnitIds.add(unitId);

        // Spawn "Dodged" floating text at the evade snapshot position.
        ctx.engine.addEffect(new Effect({
            x: snapshot.x,
            y: snapshot.y,
            duration: 0.92,
            effectType: 'FloatingText',
            effectData: {
                amount: 0,
                color: 0xfacc15,
                originX: snapshot.x,
                originY: snapshot.y,
                dirX: 0,
                dirY: -1,
                flightPx: 48,
                arcPx: 36,
            },
        }));
    }

    getCasterRenderOffset(ctx: CastBehaviourRenderContext): { x: number; y: number } | null {
        const payload = ctx.behaviourPayload as MeleeAttackPayload | undefined;
        if (!payload || payload.interrupted) return { x: 0, y: 0 };

        const { dirX, dirY } = this.resolveSlideDirection(ctx);
        const p = ctx.windowProgress;

        if (p <= this.impactAt) {
            const t = this.impactAt > 0 ? p / this.impactAt : 1;
            const forward = easeOutCubic(t) * this.slideConfig.forwardDistance;
            return { x: dirX * forward, y: dirY * forward };
        }

        // Backstep: interpolate from +forwardDistance (at impact) → -backwardDistance (end of window).
        // Starting from +forwardDistance ensures continuity with the forward phase so there
        // is no position snap at impact, even when impactAt = 0.
        const remaining = 1 - this.impactAt;
        const t = remaining > 0 ? (p - this.impactAt) / remaining : 1;
        const totalSlide = this.slideConfig.forwardDistance + this.slideConfig.backwardDistance;
        const offsetMagnitude = this.slideConfig.forwardDistance - easeInOutQuad(t) * totalSlide;
        return { x: dirX * offsetMagnitude, y: dirY * offsetMagnitude };
    }
}
