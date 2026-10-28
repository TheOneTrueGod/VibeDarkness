import type { Unit } from './Unit';
import type { DamageApplyOptions, EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { applyDamageToEarthCoreArmour } from '../../abilities/earthCoreArmour';
import { applyDamageToShields } from './unitShield';
import { applyDamageLinks } from './unitDamageLinks';
import {
    DARKNESS_CORRUPTION_RATE,
    DARKNESS_STRIKE_SECONDS,
    darknessCorruptionDamage,
} from './darknessCorruption';
import { DarknessLevel } from '../darknessLevels';
import { DEFAULT_FROZEN_HIT_POLICY, type FrozenHitPolicy } from '../time/timeConstants';

/** A hit held on a frozen unit by the `'onResume'` frozen-hit policy. Serialized with the unit. */
export interface PendingFrozenHit {
    amount: number;
    sourceUnitId: string | null;
    visualKind?: DamageApplyOptions['visualKind'];
}

/**
 * Policy for a hit on a frozen unit: the active Time Stop def's policy, then the per-hit option, then
 * `DEFAULT_FROZEN_HIT_POLICY`. (Time Stop def wins so a stop can make everything land on resume.)
 */
export function resolveFrozenHitPolicy(unit: Pick<Unit, 'frozenHitPolicyFromStop'>, opts?: DamageApplyOptions): FrozenHitPolicy {
    return unit.frozenHitPolicyFromStop ?? opts?.frozenHitPolicy ?? DEFAULT_FROZEN_HIT_POLICY;
}

/**
 * Resolve hits queued on a unit that is no longer frozen, in the order they were queued. They land as plain
 * `'immediate'` hits (so a unit frozen again meanwhile re-queues nothing: the caller only resolves when thawed).
 */
export function resolvePendingFrozenHits(unit: Unit, eventBus: EventBus): void {
    if (unit.pendingFrozenHits.length === 0 || unit.localFrozen) return;
    const hits = unit.pendingFrozenHits;
    unit.pendingFrozenHits = [];
    for (const hit of hits) {
        applyDamageToUnitDetailed(unit, hit.amount, hit.sourceUnitId, eventBus, {
            ...(hit.visualKind !== undefined ? { visualKind: hit.visualKind } : {}),
            frozenHitPolicy: 'immediate',
        });
    }
}

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
    // Frozen-hit policy: 'onResume' holds the hit on the frozen unit; 'immediate' (default) falls through.
    if (unit.localFrozen && resolveFrozenHitPolicy(unit, opts) === 'onResume') {
        unit.pendingFrozenHits.push({
            amount,
            sourceUnitId,
            ...(opts?.visualKind !== undefined ? { visualKind: opts.visualKind } : {}),
        });
        return NO_DAMAGE_BREAKDOWN;
    }
    if (unit.isInvincible()) return NO_DAMAGE_BREAKDOWN;
    if (unit.isUntargetable()) return NO_DAMAGE_BREAKDOWN;

    // God mode: prevent HP loss for player-controlled units.
    if (debugSettingsSnapshot.godModeEnabled && unit.isPlayerControlled()) {
        return NO_DAMAGE_BREAKDOWN;
    }
    const incomingAmount = unit.hasBuff('exposed') ? Math.round(amount * 1.2) : amount;
    // `shieldShare` < 1 lets part of the hit bypass shields (e.g. Blood Pact's redirected damage).
    const shieldShare = Math.min(1, Math.max(0, opts?.shieldShare ?? 1));
    const shieldable = incomingAmount * shieldShare;
    const shieldDamage = applyDamageToShields(unit, shieldable);
    const armourDamage = applyDamageToEarthCoreArmour(
        unit,
        shieldDamage.remainingDamage + (incomingAmount - shieldable),
    );
    // Damage links move part of the remaining HP loss onto the linked unit.
    const hpLoss = opts?.skipDamageLinks
        ? armourDamage.remainingDamage
        : applyDamageLinks(unit, armourDamage.remainingDamage, sourceUnitId, eventBus, opts?.visualKind);

    let remaining = hpLoss;
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
    const actual = hpLoss;
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

function landDarknessCorruptionHit(unit: Unit, engine: EngineContext): void {
    // Flat corruption damage; return value unused, so no need for the shield/armour breakdown.
    unit.takeDamage(darknessCorruptionDamage(unit.darknessDamageProcCount), null, engine.eventBus);
    unit.darknessDamageProcCount += 1;
}

/**
 * Fill the needle ring in full darkness, drain it in any brighter light, and deal damage when a strike snaps in.
 * Leaving full darkness during the strike cancels it: the ring unwinds and no hit lands.
 */
export function tickUnitDarknessCorruption(unit: Unit, dt: number, engine: EngineContext): void {
    const light = engine.getLightLevelAt(unit.x, unit.y);
    if (light === null) return;
    const inFullDarkness = light <= DarknessLevel.FULL_DARKNESS;
    if (!inFullDarkness) {
        if (unit.darknessStrikeElapsed != null) unit.darknessStrikeElapsed = null;
        unit.corruptionProgress = Math.max(0, unit.corruptionProgress - dt * DARKNESS_CORRUPTION_RATE);
        if (unit.corruptionProgress <= 0) unit.darknessDamageProcCount = 0;
        return;
    }

    let remaining = dt;
    if (unit.darknessStrikeElapsed != null) {
        unit.darknessStrikeElapsed += remaining;
        if (unit.darknessStrikeElapsed < DARKNESS_STRIKE_SECONDS) return;
        remaining = unit.darknessStrikeElapsed - DARKNESS_STRIKE_SECONDS;
        landDarknessCorruptionHit(unit, engine);
        unit.corruptionProgress = 0;
        unit.darknessStrikeElapsed = null;
        if (!unit.isAlive()) return;
    }

    while (remaining > 0) {
        const secondsUntilFull = (1 - unit.corruptionProgress) / DARKNESS_CORRUPTION_RATE;
        if (remaining < secondsUntilFull) {
            unit.corruptionProgress += remaining * DARKNESS_CORRUPTION_RATE;
            return;
        }
        remaining -= secondsUntilFull;
        unit.corruptionProgress = 1;
        if (remaining < DARKNESS_STRIKE_SECONDS) {
            unit.darknessStrikeElapsed = remaining;
            return;
        }
        remaining -= DARKNESS_STRIKE_SECONDS;
        landDarknessCorruptionHit(unit, engine);
        unit.corruptionProgress = 0;
        unit.darknessStrikeElapsed = null;
        if (!unit.isAlive()) return;
    }
}
