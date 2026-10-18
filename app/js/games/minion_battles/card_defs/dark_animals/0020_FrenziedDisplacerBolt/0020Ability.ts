/**
 * FrenziedDisplacerBolt - the enraged Displacer Spirit's version of Displacer Bolt (0017).
 * Identical bolt (speed, range, damage, projectile look, clone echoes), but the whole cast runs 30%
 * faster (aim time, cooldown tail, and the clones' follow-up delays) and the AI may use it more often
 * per round. Swapped in by `requiredTags: [Enraged]`; the calm version forbids that tag.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { mirrorAbilityToClones, type MirrorEngineLike } from '../../../game/displacer/mirrorToClones';
import {
    DISPLACER_BOLT_ENRAGED_TIME_SCALE,
    DISPLACER_BOLT_ENRAGED_USES_PER_ROUND,
} from '../../../game/displacer/displacerConstants';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { SlimeShotAbility } from '../../0001_SlimeShot/0001Ability';
import {
    DISPLACER_BOLT_COOLDOWN_SEC,
    DISPLACER_BOLT_DAMAGE,
    DISPLACER_BOLT_ID,
    DISPLACER_BOLT_IMAGE,
    DISPLACER_BOLT_LOCK_TIME,
    DISPLACER_BOLT_PREFIRE_TIME,
    DISPLACER_BOLT_PROJECTILE_RADIUS,
    DISPLACER_BOLT_SPEED,
    DISPLACER_BOLT_SPRITE_CONFIG,
    DISPLACER_BOLT_TARGET_RANGE,
    DISPLACER_BOLT_TRAVEL_DISTANCE,
} from '../0017_DisplacerBolt/0017Ability';
import { getCastElapsedAt } from '../../../game/time/actorClock';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}20`;
export const FRENZIED_DISPLACER_BOLT_ID = CARD_ID;

const SCALE = DISPLACER_BOLT_ENRAGED_TIME_SCALE;
/** Shortened timings (seconds). */
export const FRENZIED_BOLT_LOCK_TIME = DISPLACER_BOLT_LOCK_TIME * SCALE;
export const FRENZIED_BOLT_PREFIRE_TIME = DISPLACER_BOLT_PREFIRE_TIME * SCALE;
export const FRENZIED_BOLT_COOLDOWN_SEC = DISPLACER_BOLT_COOLDOWN_SEC * SCALE;

const MAX_USES = DISPLACER_BOLT_ENRAGED_USES_PER_ROUND;
/** Full refill each stamina charge (once per round), enough for the extra shots. */
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: MAX_USES },
];

const _base: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Frenzied Displacer Bolt',
    image: DISPLACER_BOLT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: FRENZIED_BOLT_PREFIRE_TIME,
    abilityTimings: [
        { id: 'draw', start: 0, end: FRENZIED_BOLT_LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: FRENZIED_BOLT_LOCK_TIME,
            end: FRENZIED_BOLT_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(DISPLACER_BOLT_SPEED)
                .withMaxRange(DISPLACER_BOLT_TRAVEL_DISTANCE)
                .withTravelFullRange()
                .withBaseDamage(DISPLACER_BOLT_DAMAGE)
                .withRadius(DISPLACER_BOLT_PROJECTILE_RADIUS)
                .withSpriteConfig(DISPLACER_BOLT_SPRITE_CONFIG),
        },
        {
            id: 'cooldown',
            start: FRENZIED_BOLT_PREFIRE_TIME,
            end: FRENZIED_BOLT_PREFIRE_TIME + FRENZIED_BOLT_COOLDOWN_SEC,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    requiredTags: [UnitTag.Enraged],
    aiSettings: {
        minRange: 0,
        maxRange: DISPLACER_BOLT_TARGET_RANGE,
        maxUsesPerRound: MAX_USES,
        priority: 10,
        ninjutsu: { ignore: true },
    },
    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[]): void {
        if (hasUnitTag(caster, UnitTag.Clone)) return;
        // Clones carry the plain bolt (0017); only the follow-up delays are compressed.
        mirrorAbilityToClones(engine as MirrorEngineLike, caster, DISPLACER_BOLT_ID, targets, {
            timeScale: SCALE,
        });
    },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: DISPLACER_BOLT_TARGET_RANGE }),

    getTooltipText(): string[] {
        return [
            `Hurls a bolt that flies twice as far as it aims, dealing ${DISPLACER_BOLT_DAMAGE} damage to an enemy`,
            'Enraged: aims and recovers 30% faster, and can be used more often each round',
            'Up to 3 clones echo the shot in quick succession',
        ];
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },
});

export const FrenziedDisplacerBoltAbility: AbilityStatic = {
    ..._base,

    /**
     * The slime telegraph is built for a 0.5s aim; replay this cast's elapsed time on that scale so the
     * narrowing V finishes (and vanishes) exactly when the faster bolt leaves.
     */
    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
        engine?: Parameters<NonNullable<AbilityStatic['renderActivePreview']>>[4],
    ): void {
        const slimeScaleTime = activeAbility.startTime + (getCastElapsedAt(activeAbility, gameTime)) / SCALE;
        SlimeShotAbility.renderActivePreview!(gr, caster, activeAbility, slimeScaleTime, engine);
    },
};

export const FrenziedDisplacerBoltCard: CardDef = {
    abilityId: CARD_ID,
};
