import type { Unit } from './Unit';
import type { DamageApplyOptions, EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { applyDamageToEarthCoreArmour } from '../../abilities/earthCoreArmour';
import { applyDamageToShields } from './unitShield';
import { DarknessLevel } from '../darknessLevels';

/** Full accounting of a single damage application, split by absorption layer. */
export interface DamageBreakdown {
    /** Damage that actually landed on the unit's hp pool (what the old plain-number API returned). */
    hpDamage: number;
    /** Earth-core armour consumed by this hit. */
    armourRemoved: number;
    /** Shield-buff hp consumed by this hit (shields are consumed before armour). */
    shieldAbsorbed: number;
}

const NO_DAMAGE_BREAKDOWN: DamageBreakdown = { hpDamage: 0, armourRemoved: 0, shieldAbsorbed: 0 };

/**
 * Apply damage to a unit, returning the full breakdown (shield/armour/hp). Shields are
 * consumed before earth-core armour (shields are per-cast/temporary; armour is longer-lived).
 * `applyDamageToUnit`/`Unit.takeDamage` remain thin wrappers around this for existing callers.
 */
export function applyDamageToUnitDetailed(
    unit: Unit,
    amount: number,
    sourceUnitId: string | null,
    eventBus: EventBus,
    opts?: DamageApplyOptions,
): DamageBreakdown {
    if (!unit.isAlive()) return NO_DAMAGE_BREAKDOWN;
    if (unit.isInvincible()) return NO_DAMAGE_BREAKDOWN;
    if (unit.isSpawning()) return NO_DAMAGE_BREAKDOWN;

    // God mode: prevent HP loss for player-controlled units.
    if (debugSettingsSnapshot.godModeEnabled && unit.isPlayerControlled()) {
        return NO_DAMAGE_BREAKDOWN;
    }
    const incomingAmount = unit.hasBuff('exposed') ? Math.round(amount * 1.2) : amount;
    const shieldDamage = applyDamageToShields(unit, incomingAmount);
    const armourDamage = applyDamageToEarthCoreArmour(unit, shieldDamage.remainingDamage);

    let remaining = armourDamage.remainingDamage;
    const prevStackSize = unit.stackSize;
    if (unit.stackSize > 1 && remaining >= unit.hp) {
        remaining -= unit.hp;
        const extraDeaths = Math.min(Math.floor(remaining / unit.maxHp), unit.stackSize - 1);
        unit.stackSize -= (1 + extraDeaths);
        if (unit.stackSize <= 0) {
            unit.hp = 0;
        } else {
            remaining -= extraDeaths * unit.maxHp;
            unit.hp = unit.maxHp - remaining;
        }
    } else {
        unit.hp = Math.max(0, unit.hp - remaining);
    }
    const actual = armourDamage.remainingDamage;
    const membersKilled = prevStackSize - Math.max(0, unit.stackSize);
    if (membersKilled > 0 && unit.hp > 0) {
        eventBus.emit('stack_members_died', { unitId: unit.id, count: membersKilled });
    } else if (membersKilled >= 2 && unit.hp <= 0) {
        // Emit ghosts for all-but-last member; unit_died handles the final death visually.
        eventBus.emit('stack_members_died', { unitId: unit.id, count: membersKilled - 1 });
    }

    eventBus.emit('damage_taken', {
        unitId: unit.id,
        amount: actual,
        sourceUnitId,
        incomingDamage: amount,
        hpDamage: actual,
        armourRemoved: armourDamage.armourRemoved,
        shieldAbsorbed: shieldDamage.shieldAbsorbed,
        visualKind: opts?.visualKind,
    });

    if (unit.hp <= 0) {
        if (unit.hasBuff('cant_die')) {
            unit.hp = 1;
            return { hpDamage: actual, armourRemoved: armourDamage.armourRemoved, shieldAbsorbed: shieldDamage.shieldAbsorbed };
        }

        unit.hp = 0;
        unit.active = false;

        eventBus.emit('unit_died', {
            unitId: unit.id,
            killerUnitId: sourceUnitId,
        });
    }

    return { hpDamage: actual, armourRemoved: armourDamage.armourRemoved, shieldAbsorbed: shieldDamage.shieldAbsorbed };
}

/** Apply damage to a unit. Returns actual hp damage dealt (thin wrapper — see `applyDamageToUnitDetailed`). */
export function applyDamageToUnit(
    unit: Unit,
    amount: number,
    sourceUnitId: string | null,
    eventBus: EventBus,
    opts?: DamageApplyOptions,
): number {
    return applyDamageToUnitDetailed(unit, amount, sourceUnitId, eventBus, opts).hpDamage;
}

export function tickUnitDarknessCorruption(unit: Unit, dt: number, engine: EngineContext): void {
    const light = engine.getLightLevelAt(unit.x, unit.y);
    if (light === null) return;
    const inFullDarkness = light <= DarknessLevel.FULL_DARKNESS;
    const corruptionRate = 0.45;
    if (inFullDarkness) {
        unit.corruptionProgress = Math.min(1, unit.corruptionProgress + dt * corruptionRate);
    } else {
        unit.corruptionProgress = Math.max(0, unit.corruptionProgress - dt * corruptionRate);
        if (unit.corruptionProgress <= 0) {
            unit.darknessDamageProcCount = 0;
        }
    }
    if (inFullDarkness && unit.corruptionProgress >= 1) {
        unit.corruptionProgress = 0;
        const hitIndex = unit.darknessDamageProcCount + 1;
        const damage = 5 * (hitIndex + 1);
        // Flat corruption damage; return value unused, so no need for the shield/armour breakdown.
        unit.takeDamage(damage, null, engine.eventBus);
        unit.darknessDamageProcCount += 1;
    }
}
