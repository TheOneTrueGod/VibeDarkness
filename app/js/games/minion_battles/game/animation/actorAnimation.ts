/**
 * A clip an ability can request from the actor that performs it.
 *
 * The ability only names the clip. The actor stores the request and when it started.
 * A renderer that recognizes the type and variant draws it. Everyone else leaves the
 * stored request alone.
 *
 * Time is the clock the caller passes (the turret uses world time, the same clock as its shots).
 */

/** Attack clip. Renderers choose a variant they know how to draw. */
export const ACTOR_ANIMATION_TYPE_ATTACK = 'attack';
/** Barrel or weapon pulls back, then eases forward. */
export const ACTOR_ANIMATION_VARIANT_RANGED = 'ranged';

/**
 * Share of an attack/ranged clip spent snapping backward.
 * The rest of the clip eases forward to the rest pose, so the return lasts three times the snap.
 */
export const RANGED_ATTACK_SNAP_SHARE = 0.25;

export interface ActorAnimationRequest {
    type: string;
    variant: string;
    /** Clip length in seconds on the clock passed to {@link playActorAnimation}. */
    duration: number;
}

export interface ActorAnimationState {
    request: ActorAnimationRequest;
    startedAtGameTime: number;
}

export interface ActorAnimationHost {
    animation: ActorAnimationState | null;
}

export function playActorAnimation(
    actor: ActorAnimationHost,
    request: ActorAnimationRequest,
    gameTime: number,
): void {
    actor.animation = {
        request: { type: request.type, variant: request.variant, duration: request.duration },
        startedAtGameTime: gameTime,
    };
}

/** Play the clip declared on the ability, if it declared one. */
export function playAbilityAnimation(
    actor: ActorAnimationHost,
    ability: { animation?: ActorAnimationRequest } | undefined,
    gameTime: number,
): void {
    if (!ability?.animation) return;
    playActorAnimation(actor, ability.animation, gameTime);
}

/** 0 at the start of the clip, 1 at the end. Null when there is no clip in progress. */
export function actorAnimationProgress(
    state: ActorAnimationState | null | undefined,
    gameTime: number,
): number | null {
    if (!state || !(state.request.duration > 0)) return null;
    const progress = (gameTime - state.startedAtGameTime) / state.request.duration;
    if (progress < 0 || progress > 1) return null;
    return progress;
}

/**
 * How far an attack/ranged clip has pulled back: 0 at rest, 1 fully back, then 0 again.
 * Any other clip, or no clip, is 0 so the rest pose stays put.
 */
export function rangedAttackPull(state: ActorAnimationState | null | undefined, gameTime: number): number {
    if (state?.request.type !== ACTOR_ANIMATION_TYPE_ATTACK) return 0;
    if (state.request.variant !== ACTOR_ANIMATION_VARIANT_RANGED) return 0;
    const progress = actorAnimationProgress(state, gameTime);
    if (progress == null) return 0;
    if (progress <= RANGED_ATTACK_SNAP_SHARE) return progress / RANGED_ATTACK_SNAP_SHARE;
    return (1 - progress) / (1 - RANGED_ATTACK_SNAP_SHARE);
}

export function readActorAnimation(raw: unknown): ActorAnimationState | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as { request?: unknown; startedAtGameTime?: unknown };
    const request = record.request;
    if (!request || typeof request !== 'object') return null;
    const clip = request as { type?: unknown; variant?: unknown; duration?: unknown };
    if (typeof clip.type !== 'string' || typeof clip.variant !== 'string') return null;
    if (typeof clip.duration !== 'number' || !(clip.duration > 0)) return null;
    if (typeof record.startedAtGameTime !== 'number') return null;
    return {
        request: { type: clip.type, variant: clip.variant, duration: clip.duration },
        startedAtGameTime: record.startedAtGameTime,
    };
}
