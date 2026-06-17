/**
 * ThrowKnife - Research-upgraded Throw Rock variant.
 *
 * Base version throws one knife for more damage than Throw Rock.
 * If both Throwing Knives and More Rock are researched, throws a second knife.
 */

import type { AbilityRecoveryRule, AbilityStatic, AttackBlockedInfo } from '../../abilities/Ability';
import { getAbilityModifier } from '../../abilities/abilityModifierHelpers';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import type { Unit } from '../../game/units/Unit';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { type CardDef } from '../types';
import { CRYSTAL_ROCKS_NODE_PIERCING_KNIVES } from '../../../../researchTrees/trees/crystal_rocks';
import {
    beginThrowCastPayload,
    buildMoreRockTimings,
    buildThrowBaseTimings,
    getCrystalRocksResearch,
    hasMoreRockResearch,
    ONE_PIXEL_TARGET,
    THROW_PROJECTILE_SPEED,
    THROW_RANGE,
    throwMovementPenaltyStates,
    throwMovementPenaltyStatesForActive,
    TWO_PIXEL_TARGETS,
} from '../throwSharedTimings';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';

const ABILITY_ID = 'throw_knife';
const MAX_USES = 5;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const BASE_DAMAGE = 7;

function hasKnifeMultiThrow(research: Set<string>): boolean {
    return research.has('throwing_knives') && hasMoreRockResearch(research);
}

function hasKnifePierce(research: Set<string>): boolean {
    return research.has(CRYSTAL_ROCKS_NODE_PIERCING_KNIVES);
}

function resolveKnifeDamage(ctx: import('../../abilities/castBehaviourTypes').CastBehaviourSetupContext): number {
    const mod = ctx.caster.abilityModifiers[ABILITY_ID] ?? {};
    return BASE_DAMAGE + (mod.damageFlat ?? 0);
}

function knifeLaunchBehaviour(pierce: number) {
    return CastBehaviours.ProjectileLaunch()
        .withSpeed(THROW_PROJECTILE_SPEED)
        .withMaxRange(THROW_RANGE)
        .withProjectileType('throwing_knife')
        .withPierce(pierce)
        .withResolveDamage(resolveKnifeDamage);
}

function buildKnifeTimings(research: Set<string>) {
    const pierce = hasKnifePierce(research) ? 1 : 0;
    const launch = knifeLaunchBehaviour(pierce);
    if (hasKnifeMultiThrow(research)) {
        return buildMoreRockTimings({ launchBehaviour: launch });
    }
    return buildThrowBaseTimings({ launchBehaviour: launch });
}

const THROW_KNIFE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="28" y="34" width="8" height="20" rx="2" fill="#7a4a24"/>
  <polygon points="32,6 25,34 39,34" fill="#d8dde3"/>
  <line x1="28" y1="31" x2="36" y2="31" stroke="#c5905c" stroke-width="2"/>
  <line x1="29" y1="14" x2="32" y2="33" stroke="#f5f7f9" stroke-width="1"/>
</svg>`;

export const ThrowKnife: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Throw Knife',
    image: THROW_KNIFE_IMAGE,
    tags: ['RockThrow'],
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0.3,
    abilityTimings: buildThrowBaseTimings({ launchBehaviour: knifeLaunchBehaviour(0) }),
    getAbilityTimings(caster, gameState) {
        const research = getCrystalRocksResearch(gameState as AbilityEngineContext | undefined, caster);
        return buildKnifeTimings(research);
    },
    targets: TWO_PIXEL_TARGETS,
    getTargets(caster?: Unit, gameState?: unknown): TargetDef[] {
        const research = getCrystalRocksResearch(gameState as AbilityEngineContext | undefined, caster);
        return hasKnifeMultiThrow(research) ? TWO_PIXEL_TARGETS : ONE_PIXEL_TARGET;
    },
    aiSettings: { minRange: 0, maxRange: THROW_RANGE },

    getTooltipText(gameState?: unknown): string[] {
        const eng = gameState as AbilityEngineContext | undefined;
        const research = getCrystalRocksResearch(eng);
        const pierceLine = hasKnifePierce(research) ? ' Pierces through the {first target}.' : '';
        const mod = getAbilityModifier(gameState, undefined, ABILITY_ID);
        const dmg = BASE_DAMAGE + (mod.damageFlat ?? 0);
        if (hasKnifeMultiThrow(research)) {
            return [`Throws {2} knives dealing {${dmg}} damage each to the first enemy hit`];
        }
        return [`Throws a knife dealing {${dmg}} damage to the first enemy hit.${pierceLine}`];
    },

    beginActiveCast(engine, caster, _targets, active) {
        const research = getCrystalRocksResearch(engine as AbilityEngineContext | undefined, caster);
        active.castPayload = beginThrowCastPayload(hasKnifeMultiThrow(research));
    },

    getAbilityStatesForActive(currentTime, active) {
        return throwMovementPenaltyStatesForActive(currentTime, active);
    },

    getAbilityStates(currentTime) {
        return throwMovementPenaltyStates(currentTime);
    },

    onAttackBlocked(_engine, _defender, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },

    renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, mouseWorld, _units, gameState): void {
        const research = getCrystalRocksResearch(gameState as AbilityEngineContext | undefined, caster);
        if (!hasKnifeMultiThrow(research)) {
            drawClampedLine(gr, caster, mouseWorld, THROW_RANGE);
            return;
        }

        drawClampedLine(gr, caster, mouseWorld, THROW_RANGE, { color: 0xd8dde3, width: 2, alpha: 0.75 });
        const clamped = clampToMaxRange(caster, mouseWorld, THROW_RANGE);
        drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0xd8dde3, width: 2, alpha: 0.95 });

        if (currentTargets.length >= 1) {
            const first = currentTargets[0];
            if (first?.type === 'pixel' && first.position) {
                const c = clampToMaxRange(caster, first.position, THROW_RANGE);
                gr.moveTo(caster.x, caster.y);
                gr.lineTo(c.endX, c.endY);
                gr.stroke({ color: 0xd8dde3, width: 2, alpha: 0.35 });
                drawCrosshair(gr, c.endX, c.endY, 10, { color: 0xd8dde3, width: 2, alpha: 0.95 });
            }
        }
    },
};

export const ThrowKnifeCard: CardDef = {
    abilityId: 'throw_knife',
};
