/**
 * Court Magician enemy family: ids, colours and the numbers several abilities share. The Court
 * Magician is the castle's last illusionist, fighting through a set of dark crystals: he rearranges
 * them around the fight (Rearrange), makes every crystal burst into a ring of shards (Shard Nova),
 * flings them at a player one after another (Crystal Volley, each crystal using Crystal Ram), and
 * blinks away when cornered (Blink). Enraged, he stops time and fuses the crystals into one laser
 * (Crystal Laser) that the party has to shield in turns.
 */

import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { resolveAbilityTheme } from '../../themes/abilityTheme';
import { COURT_MAGIC_THEME } from '../../themes/abilityThemes';
import { Effect } from '../../game/effects/Effect';
import type { PulseEffectData } from '../../game/effect_defs/aoeEffects';
import type { Unit } from '../../game/units/Unit';
import type { EngineContext } from '../../game/EngineContext';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { CircleHitbox } from '../../hitboxes';

const GROUP = formatGroupId(AbilityGroupId.EnemyCourtMagician);

export const REARRANGE_ABILITY_ID = `${GROUP}01`;
export const SHARD_NOVA_ABILITY_ID = `${GROUP}02`;
export const CRYSTAL_VOLLEY_ABILITY_ID = `${GROUP}03`;
export const CRYSTAL_RAM_ABILITY_ID = `${GROUP}04`;
export const BLINK_ABILITY_ID = `${GROUP}05`;
export const MIRROR_SWAP_ABILITY_ID = `${GROUP}06`;
/** Enemy super (90+ range). */
export const CRYSTAL_LASER_ABILITY_ID = `${GROUP}90`;
export const CONJURE_CRYSTAL_ABILITY_ID = `${GROUP}07`;

export const COURT_MAGICIAN_ID = 'court_magician';
export const COURT_CRYSTAL_ID = 'court_crystal';

const THEME = resolveAbilityTheme(COURT_MAGIC_THEME);
/** Crystal mass: bodies, telegraph fills. */
export const COURT_VIOLET = THEME.primaryNum;
/** The event: shard edges, beams, flashes. */
export const COURT_ORCHID = THEME.secondaryNum;
/** Telegraph red for every Court Magician attack that can hurt. */
export const COURT_TELEGRAPH_RED = 0xef4444;

/** A soft violet pulse (cast flourishes, crystals arriving). */
export const COURT_PULSE_COLORS = [COURT_ORCHID, COURT_VIOLET, 0x12001f] as const;

/** Crystal landing puff reaches this many crystal radii (kept small: several crystals land at once). */
export const CRYSTAL_LANDING_PULSE_RADII = 2;

/** A rearranged crystal that lands hurts everything within this many px of its edge (plus its own radius). */
export const CRYSTAL_LANDING_STRIKE_EXTRA_RADIUS = 40;
export const CRYSTAL_LANDING_DAMAGE = 3;

/** Radius of the landing shockwave and damage circle for a crystal of `crystalRadius`. */
export function crystalLandingStrikeRadius(crystalRadius: number): number {
    return CRYSTAL_LANDING_STRIKE_EXTRA_RADIUS + crystalRadius;
}

/**
 * A crystal settles into place (Rearrange): a small shockwave marks the area and every enemy of `caster`
 * inside it takes `CRYSTAL_LANDING_DAMAGE`.
 */
export function crystalLandingStrike(engine: EngineContext, caster: Unit, crystal: Unit): void {
    const radius = crystalLandingStrikeRadius(crystal.radius);
    engine.addEffect(crystalLandingPulse(crystal, { effectData: landingPulseData(radius) }));
    for (const target of CircleHitbox.getUnitsInHitbox(engine, caster, crystal.x, crystal.y, radius)) {
        tryDamageOrBlock(target, {
            engine,
            gameTime: engine.gameTime,
            eventBus: engine.eventBus,
            attackerX: crystal.x,
            attackerY: crystal.y,
            attackerId: caster.id,
            abilityId: REARRANGE_ABILITY_ID,
            damage: CRYSTAL_LANDING_DAMAGE,
            attackType: 'melee',
        });
    }
}

function landingPulseData(maxRadius: number): PulseEffectData {
    return { colors: [...COURT_PULSE_COLORS], maxRadius, alpha: 0.7, lineWidth: 2 };
}

/** The subtle puff a crystal gives off when it settles into place (Rearrange, Crystal Laser's wall). */
export function crystalLandingPulse(unit: Unit, extra?: Partial<ConstructorParameters<typeof Effect>[0]>): Effect {
    const data: PulseEffectData = {
        colors: [...COURT_PULSE_COLORS],
        maxRadius: unit.radius * CRYSTAL_LANDING_PULSE_RADII,
        alpha: 0.6,
        lineWidth: 1.5,
    };
    return new Effect({ x: unit.x, y: unit.y, duration: 0.35, effectType: 'Pulse', effectData: data, ...extra });
}
