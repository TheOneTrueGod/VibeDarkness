import { describe, expect, it } from 'vitest';
import {
    ACTOR_ANIMATION_TYPE_ATTACK,
    ACTOR_ANIMATION_VARIANT_RANGED,
    RANGED_ATTACK_SNAP_SHARE,
    actorAnimationProgress,
    playAbilityAnimation,
    rangedAttackPull,
    type ActorAnimationHost,
    type ActorAnimationRequest,
} from './actorAnimation';

const CLIP_DURATION = 0.4;

const RANGED_ATTACK: ActorAnimationRequest = {
    type: ACTOR_ANIMATION_TYPE_ATTACK,
    variant: ACTOR_ANIMATION_VARIANT_RANGED,
    duration: CLIP_DURATION,
};

function host(): ActorAnimationHost {
    return { animation: null };
}

describe('actor animation', () => {
    it('stores the ability clip on the actor and samples it on the given clock', () => {
        const actor = host();
        const startedAt = 1;
        playAbilityAnimation(actor, { animation: RANGED_ATTACK }, startedAt);

        expect(actor.animation?.request).toEqual(RANGED_ATTACK);
        expect(actorAnimationProgress(actor.animation, startedAt)).toBe(0);
        expect(actorAnimationProgress(actor.animation, startedAt + CLIP_DURATION)).toBeCloseTo(1);
        expect(actorAnimationProgress(actor.animation, startedAt + CLIP_DURATION * 2)).toBeNull();
    });

    it('leaves the actor alone when the ability declares no clip', () => {
        const actor = host();
        playAbilityAnimation(actor, {}, 0);
        expect(actor.animation).toBeNull();
    });

    it('snaps a ranged attack back, then eases it forward', () => {
        const actor = host();
        playAbilityAnimation(actor, { animation: RANGED_ATTACK }, 0);
        const snapDone = CLIP_DURATION * RANGED_ATTACK_SNAP_SHARE;
        const midReturn = snapDone + (CLIP_DURATION - snapDone) / 2;

        expect(rangedAttackPull(actor.animation, 0)).toBe(0);
        expect(rangedAttackPull(actor.animation, snapDone)).toBe(1);
        expect(rangedAttackPull(actor.animation, midReturn)).toBeCloseTo(0.5);
        expect(rangedAttackPull(actor.animation, CLIP_DURATION)).toBe(0);
        expect(rangedAttackPull(actor.animation, CLIP_DURATION * 2)).toBe(0);
    });

    it('ignores a clip the ranged-attack pose does not know', () => {
        const actor = host();
        playAbilityAnimation(actor, {
            animation: { type: ACTOR_ANIMATION_TYPE_ATTACK, variant: 'melee', duration: CLIP_DURATION },
        }, 0);
        const snapDone = CLIP_DURATION * RANGED_ATTACK_SNAP_SHARE;
        expect(rangedAttackPull(actor.animation, snapDone)).toBe(0);
    });
});
