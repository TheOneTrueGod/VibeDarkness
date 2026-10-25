/**
 * Stoney Punch: an Earth Core melee burst. The caster locks on an enemy in a short line; when the
 * punch lands it spends all of the caster's Earth armour and deals 4 damage plus 2 per armour spent.
 * Built on `MeleeAttack` (blockable like any punch); the armour is spent once per cast, on the first
 * attack that is made, and a punch that finds nobody keeps the armour.
 */

import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { getEarthCoreArmour, spendAllEarthCoreArmour } from '../0527_EarthCoreShared/earthCoreArmour';
import { type CardDef } from '../../types';
import { meleeLineHitbox } from '../../../hitboxes';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';

const ABILITY_ID = '0533';
const BASE_DAMAGE = 4;
const BONUS_DAMAGE_PER_ARMOUR = 2;
const MAX_RANGE = 75;
const STONEY_PUNCH_HITBOX = meleeLineHitbox(MAX_RANGE, 25);

const TOOLTIP_LINES = [
    'Melee burst. Consumes all armour, adding {{DAMAGE}} damage per armour consumed.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: BONUS_DAMAGE_PER_ARMOUR },
};

/** Per-cast state kept on `active.castPayload` (JSON-serialized with the cast). */
interface StoneyPunchCastPayload {
    /** Armour spent by this cast's punch; set the first time the punch makes an attack. */
    spentArmour?: number;
}

/**
 * Armour spent on this cast: all of it on the first call, remembered on the cast so a second hit of
 * the same punch (or a repeated call) reuses it instead of spending again.
 */
function spendArmourOnce(caster: Unit, castPayload: unknown): number {
    const payload = (castPayload !== null && typeof castPayload === 'object')
        ? castPayload as StoneyPunchCastPayload
        : null;
    if (payload?.spentArmour !== undefined) return payload.spentArmour;
    const spent = spendAllEarthCoreArmour(caster);
    if (payload) payload.spentArmour = spent;
    return spent;
}

/**
 * Lock-on range matches the old flat check: the target's centre within 75px plus its radius (the
 * caster's own radius is part of the lock-on formula, so it is taken back out here).
 */
const strike = CastBehaviours.MeleeAttack()
    .withHitbox(STONEY_PUNCH_HITBOX)
    .withLockOnExtra(MAX_RANGE - DEFAULT_UNIT_RADIUS)
    .withImpactAt(0)
    .withSlide({ forwardDistance: 0, backwardDistance: 0 })
    .withDamage((ctx) => BASE_DAMAGE + spendArmourOnce(ctx.caster, ctx.castPayload) * BONUS_DAMAGE_PER_ARMOUR);

const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.22, abilityPhase: AbilityPhase.Windup },
    {
        id: 'active',
        start: 0.22,
        end: 0.35,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: { kind: 'select', label: 'Melee target', hitbox: STONEY_PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
        behaviour: strike,
    },
    { id: 'cooldown', start: 0.35, end: 0.8, abilityPhase: AbilityPhase.Cooldown },
];

const STONEY_PUNCH_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="24" height="24" rx="6" fill="#6b6b6b"/>
  <path d="M12 23 L16 14 L20 22 L24 13 L28 23" stroke="#e5e7eb" stroke-width="2" fill="none"/>
</svg>`;

export const StoneyPunch: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Stoney Punch',
    image: STONEY_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.22,
    abilityTimings: TIMINGS,
    targets: [],
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: ABILITY_ID } }),
        );
    },
    getAbilityStates(): [] {
        return [];
    },
    beginActiveCast(_engine: unknown, _caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
        active.castPayload = {} satisfies StoneyPunchCastPayload;
    },
};

export const StoneyPunchCard: CardDef = {
    abilityId: ABILITY_ID,
};

export function getStoneyPunchPreviewDamage(caster: Unit): number {
    return BASE_DAMAGE + (getEarthCoreArmour(caster) * BONUS_DAMAGE_PER_ARMOUR);
}
