import type { Unit } from './Unit';
import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { applyDamageToEarthCoreArmour } from '../../abilities/earthCoreArmour';
import { DarknessLevel } from '../darknessLevels';

/** Apply damage to a unit. Returns actual damage dealt. */
export function applyDamageToUnit(unit: Unit, amount: number, sourceUnitId: string | null, eventBus: EventBus): number {
    if (!unit.isAlive()) return 0;
    if (unit.isInvincible()) return 0;
    if (unit.isSpawning()) return 0;

    // God mode: prevent HP loss for player-controlled units.
    if (debugSettingsSnapshot.godModeEnabled && unit.isPlayerControlled()) {
        return 0;
    }
    const incomingAmount = unit.hasBuff('exposed') ? Math.round(amount * 1.2) : amount;
    const armourDamage = applyDamageToEarthCoreArmour(unit, incomingAmount);

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
    });

    if (unit.hp <= 0) {
        if (unit.hasBuff('cant_die')) {
            unit.hp = 1;
            return actual;
        }

        unit.hp = 0;
        unit.active = false;

        eventBus.emit('unit_died', {
            unitId: unit.id,
            killerUnitId: sourceUnitId,
        });
    }

    return actual;
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
        unit.takeDamage(damage, null, engine.eventBus);
        unit.darknessDamageProcCount += 1;
    }
}
