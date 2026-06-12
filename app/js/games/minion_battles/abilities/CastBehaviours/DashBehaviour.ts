/**
 * DashBehaviour — movement CastBehaviour for dash/dodge abilities.
 *
 * Moves the caster toward a pixel target over the full timing window, terrain-aware.
 * Optional afterimage trail: spawned here (not via emitterDef) because the trail
 * velocity is perpendicular to the dash direction, requiring runtime direction data.
 *
 * Optional hitbox via addHitbox(): caster-anchored touch detection that deals damage
 * and fires ON_ATTACK_HIT events per hit unit (enabling abilityEvents side-effects such
 * as knockback). Uses touch semantics: a unit is hit when the two circles overlap.
 */

import type { Unit } from '../../game/units/Unit';
import type {
    CastBehaviour,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { getDirectionFromTo } from '../targetHelpers';
import { applyForcedDisplacementToward } from '../effectHelpers';
import { getBodyColorForUnit, getCharacterSpriteKey } from '../../game/units/unit_defs/unitDef';
import { Effect } from '../../game/effects/Effect';
import type { HitboxDef } from '../hitboxDef';
import { tryDamageOrBlock } from '../blockingHelpers';
import { areEnemies } from '../../game/teams';

const AFTERIMAGE_DURATION = 6 / 60;
const AFTERIMAGE_INITIAL_ALPHA = 0.75;

interface DashHitboxConfig {
    def: HitboxDef;
    damage: number | ((ctx: CastBehaviourTickContext) => number);
    attackType: 'melee' | 'charging';
    filter: 'enemy' | 'ally' | 'any';
}

interface DashPayload {
    targetX: number;
    targetY: number;
    maxDistance: number;
    // Afterimage state — null when afterimages are disabled.
    afterimage: {
        bodyColor: number;
        radius: number;
        characterSpriteKey?: string;
        perpX: number; // unit vector perpendicular to dash direction
        perpY: number;
        tickCount: number;
    } | null;
    // Hit-dedup set — null when no hitbox is configured.
    hitIds: Set<string> | null;
    // When stopAfterHits is set, set to true once that many units have been hit so
    // subsequent ticks skip movement.
    stopped: boolean;
}

export class DashBehaviour implements CastBehaviour {
    private _maxDistance: number = 140;
    private _collisionStep: number = 4;
    private _afterimagesEnabled: boolean = false;
    private _afterimageEveryNTicks: number = 2;
    private _hitbox: DashHitboxConfig | null = null;
    /** Stop dash movement after this many successful hits; null = never stop on hit. */
    private _stopAfterHits: number | null = null;
    private _onHitCallback: ((hitUnit: Unit, ctx: CastBehaviourTickContext) => void) | null = null;
    /** When false, movement is skipped and only hitbox detection runs each tick. */
    private _movementEnabled: boolean = true;

    withMaxDistance(px: number): this {
        this._maxDistance = px;
        return this;
    }

    withCollisionStep(px: number): this {
        this._collisionStep = px;
        return this;
    }

    /** Spawn an afterimage trail during the dash. everyNTicks controls emission rate (default 2 = 15 Hz at 30 Hz physics). */
    withAfterimages(enabled = true, everyNTicks = 2): this {
        this._afterimagesEnabled = enabled;
        this._afterimageEveryNTicks = everyNTicks;
        return this;
    }

    /** Optional callback fired once per hit unit during `_processHitbox`. Runs after the hit is confirmed. */
    withOnHit(cb: (hitUnit: Unit, ctx: CastBehaviourTickContext) => void): this {
        this._onHitCallback = cb;
        return this;
    }

    /**
     * Stop dash movement after the touch hitbox registers its Nth successful hit.
     * The timing window continues to run (for afterimages, effects, etc.) but
     * no further displacement is applied. Existing dashes without this are unaffected.
     */
    withStopAfterHits(count: number): this {
        this._stopAfterHits = count;
        return this;
    }

    /** Shorthand for {@link withStopAfterHits}(1). */
    withStopOnHit(enabled = true): this {
        this._stopAfterHits = enabled ? 1 : null;
        return this;
    }

    /**
     * Disable movement so only the hitbox detection runs each tick.
     * Use when doCardEffect (or another system) handles movement but you still
     * want the declarative addHitbox() hit-detection and dedup.
     */
    withMovement(enabled: boolean): this {
        this._movementEnabled = enabled;
        return this;
    }

    /**
     * Add a caster-anchored hitbox that deals damage to units the caster touches during the dash.
     * anchor must be 'caster' (only supported value). def describes the shape; for circle with
     * range 'caster', the radius equals caster.radius at call time. Hit semantics: dist <= hitRadius + unit.radius.
     * Fires ON_ATTACK_HIT via tryDamageOrBlock, allowing abilityEvents rules to handle side-effects.
     */
    addHitbox(
        _anchor: 'caster',
        def: HitboxDef,
        attack: { damage: number | ((ctx: CastBehaviourTickContext) => number); attackType: 'melee' | 'charging'; filter?: 'enemy' | 'ally' | 'any' },
    ): this {
        this._hitbox = {
            def,
            damage: attack.damage,
            attackType: attack.attackType,
            filter: attack.filter ?? 'enemy',
        };
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const target = ctx.target;
        if (target.type !== 'pixel' || !target.position) {
            ctx.setBehaviourPayload({ targetX: ctx.caster.x, targetY: ctx.caster.y, maxDistance: 0, afterimage: null, hitIds: null, stopped: false });
            return;
        }

        const { x: targetX, y: targetY } = target.position;
        const { dirX, dirY, dist } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, targetX, targetY);
        const maxDistance = Math.min(this._maxDistance, dist);

        let afterimage: DashPayload['afterimage'] = null;
        if (this._afterimagesEnabled) {
            afterimage = {
                bodyColor: getBodyColorForUnit(ctx.caster),
                radius: ctx.caster.radius,
                characterSpriteKey: getCharacterSpriteKey(ctx.caster.characterId),
                perpX: -dirY, // 90° counterclockwise
                perpY: dirX,
                tickCount: 0,
            };
        }

        ctx.setBehaviourPayload({
            targetX,
            targetY,
            maxDistance,
            afterimage,
            hitIds: this._hitbox ? new Set<string>() : null,
            stopped: false,
        } satisfies DashPayload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as DashPayload | null;
        if (!payload || payload.maxDistance <= 0) return;

        const { targetX, targetY, maxDistance } = payload;
        const distToTarget = Math.hypot(targetX - ctx.caster.x, targetY - ctx.caster.y);

        if (this._movementEnabled && !payload.stopped && distToTarget > 0) {
            const progressDelta = ctx.windowProgress - ctx.prevWindowProgress;
            const moveThisTick = Math.min(progressDelta * maxDistance, distToTarget);
            if (moveThisTick > 0) {
                applyForcedDisplacementToward(ctx.engine, ctx.caster, targetX, targetY, moveThisTick, {
                    step: this._collisionStep,
                });
            }
        }

        if (payload.afterimage) {
            payload.afterimage.tickCount++;
            if (payload.afterimage.tickCount % this._afterimageEveryNTicks === 0) {
                this._spawnAfterimage(ctx, payload.afterimage);
            }
            ctx.setBehaviourPayload(payload);
        }

        // Hitbox check runs after movement so hit detection uses the caster's new position.
        if (this._hitbox !== null && payload.hitIds !== null) {
            this._processHitbox(ctx, payload);
        }
    }

    private _processHitbox(ctx: CastBehaviourTickContext, payload: DashPayload): void {
        const { def, damage: damageOrFn, attackType, filter } = this._hitbox!;
        const hitRadius = def.shape === 'circle'
            ? (def.range === 'caster' ? ctx.caster.radius : def.range)
            : ctx.caster.radius;

        for (const unit of ctx.engine.units) {
            if (!unit.active || !unit.isAlive()) continue;
            if (unit.id === ctx.caster.id) continue;
            if (filter === 'enemy' && !areEnemies(ctx.caster.teamId, unit.teamId)) continue;
            if (filter === 'ally' && areEnemies(ctx.caster.teamId, unit.teamId)) continue;
            if (payload.hitIds!.has(unit.id)) continue;
            if (unit.hasIFrames(ctx.engine.gameTime)) continue;

            const dist = Math.hypot(unit.x - ctx.caster.x, unit.y - ctx.caster.y);
            if (dist > hitRadius + unit.radius) continue;

            const damage = typeof damageOrFn === 'function' ? damageOrFn(ctx) : damageOrFn;
            const outcome = tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: ctx.caster.x,
                attackerY: ctx.caster.y,
                attackerId: ctx.caster.id,
                abilityId: ctx.abilityId,
                damage,
                attackType,
            });
            if (outcome.hit) {
                payload.hitIds!.add(unit.id);
                if (this._stopAfterHits !== null && payload.hitIds!.size >= this._stopAfterHits) {
                    payload.stopped = true;
                }
                this._onHitCallback?.(unit, ctx);
            }
        }
        ctx.setBehaviourPayload(payload);
    }

    private _spawnAfterimage(ctx: CastBehaviourTickContext, ai: NonNullable<DashPayload['afterimage']>): void {
        // cosmetic-only: afterimage drift is visual, not part of synced state
        // eslint-disable-next-line no-restricted-syntax
        const speed = (Math.random() - 0.5) * 50;
        const eng = ctx.engine as { addEffect(e: Effect): void };
        eng.addEffect(new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: AFTERIMAGE_DURATION,
            effectType: 'Afterimage',
            effectData: {
                bodyColor: ai.bodyColor,
                radius: ai.radius,
                characterSpriteKey: ai.characterSpriteKey,
                initialAlpha: AFTERIMAGE_INITIAL_ALPHA,
                vx: ai.perpX * speed,
                vy: ai.perpY * speed,
            },
        }));
    }
}
