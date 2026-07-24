/**
 * Compile active DarknessStrength packages into enemy/player passive bags,
 * world-modifier defs (spawn tweaks / inline WM), and bake statBags onto units at spawn.
 *
 * Merge rules mirror research passives: add sums; mult is `1 + Σ(mult − 1)`.
 */

import {
    applyPassiveBonusToBase,
    DEFAULT_PASSIVE_MULT,
} from '../researchTrees/passiveBonuses';
import type { PassiveBonusMap, PassiveBonuses, PassiveStatKey } from '../researchTrees/types';
import type { WorldModifierDef } from '../games/minion_battles/worldModifiers/types';
import type { SpawnUnitsEffect } from '../games/minion_battles/worldModifiers/WorldEffect';
import type { ActiveDarknessStrength } from './resolve';
import type { UnitFilterSubject } from './types';
import { matchesUnitFilter } from './unitFilter';

/** Merged enemy/player bags from {@link compileStatBags}. */
export interface DarknessStrengthStatBags {
    enemy: PassiveBonuses;
    player: PassiveBonuses;
}

/** Minimal unit surface needed to bake DarknessStrength statBags. */
export interface DarknessStrengthStatBagTarget {
    characterId: string;
    teamId: string;
    tags?: readonly string[];
    hp: number;
    maxHp: number;
    passiveBonuses?: PassiveBonuses;
    combatSettings?: {
        damageModifier?: { flatAmt: number; multiplier: number };
    } | null;
}

function ensureEntry(result: PassiveBonuses, key: PassiveStatKey): { add: number; mult: number } {
    const existing = result[key];
    if (existing) return existing;
    const created = { add: 0, mult: DEFAULT_PASSIVE_MULT };
    result[key] = created;
    return created;
}

/** Contribute one PassiveBonusMap into a bag (full strength — no research levels). */
export function contributePassiveBonusMap(result: PassiveBonuses, map: PassiveBonusMap): void {
    for (const [rawKey, entry] of Object.entries(map)) {
        if (!entry) continue;
        const bag = ensureEntry(result, rawKey as PassiveStatKey);
        if (entry.add !== undefined) {
            bag.add += entry.add;
        }
        if (entry.mult !== undefined) {
            bag.mult += entry.mult - DEFAULT_PASSIVE_MULT;
        }
    }
}

function pruneEmpty(result: PassiveBonuses): PassiveBonuses {
    for (const key of Object.keys(result) as PassiveStatKey[]) {
        const entry = result[key];
        if (!entry) continue;
        if (entry.add === 0 && entry.mult === DEFAULT_PASSIVE_MULT) {
            delete result[key];
        }
    }
    return result;
}

/**
 * Merge two aggregated bags with the same add/mult stacking rules.
 * Returns `undefined` when both inputs are empty/undefined.
 */
export function mergePassiveBonuses(
    a: PassiveBonuses | undefined,
    b: PassiveBonuses | undefined,
): PassiveBonuses | undefined {
    if (!a && !b) return undefined;
    const result: PassiveBonuses = {};
    if (a) {
        for (const [rawKey, entry] of Object.entries(a)) {
            if (!entry) continue;
            const bag = ensureEntry(result, rawKey as PassiveStatKey);
            bag.add += entry.add;
            bag.mult += entry.mult - DEFAULT_PASSIVE_MULT;
        }
    }
    if (b) {
        for (const [rawKey, entry] of Object.entries(b)) {
            if (!entry) continue;
            const bag = ensureEntry(result, rawKey as PassiveStatKey);
            bag.add += entry.add;
            bag.mult += entry.mult - DEFAULT_PASSIVE_MULT;
        }
    }
    pruneEmpty(result);
    return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Merge `statBag` compile effects into enemy/player bags.
 *
 * - With `subject`: filter-aware — only effects whose filter matches contribute.
 * - Without `subject`: only unfiltered effects contribute (safe global bags).
 */
export function compileStatBags(
    active: readonly ActiveDarknessStrength[],
    subject?: UnitFilterSubject,
): DarknessStrengthStatBags {
    const enemy: PassiveBonuses = {};
    const player: PassiveBonuses = {};

    for (const { def } of active) {
        for (const effect of def.compile) {
            if (effect.type !== 'statBag') continue;
            if (subject !== undefined) {
                if (!matchesUnitFilter(subject, effect.filter)) continue;
            } else if (effect.filter) {
                continue;
            }
            contributePassiveBonusMap(effect.target === 'enemy' ? enemy : player, effect.bonuses);
        }
    }

    return { enemy: pruneEmpty(enemy), player: pruneEmpty(player) };
}

function teamStatBuffTarget(teamId: string): 'enemy' | 'player' | null {
    if (teamId === 'enemy') return 'enemy';
    if (teamId === 'player') return 'player';
    return null;
}

/**
 * Bake compiled DarknessStrength `statBag`s onto a freshly spawned unit.
 * Assumes current `maxHp` / combatSettings do not yet include these packages.
 * No-op when the unit's team has no matching bag.
 */
export function applyDarknessStrengthStatBuffs(
    unit: DarknessStrengthStatBagTarget,
    active: readonly ActiveDarknessStrength[],
): void {
    if (active.length === 0) return;

    const target = teamStatBuffTarget(unit.teamId);
    if (!target) return;

    const subject: UnitFilterSubject = {
        characterId: unit.characterId,
        tags: unit.tags as UnitFilterSubject['tags'],
    };
    const bag = compileStatBags(active, subject)[target];
    if (Object.keys(bag).length === 0) return;

    const rawMaxHp = unit.maxHp;
    const merged = mergePassiveBonuses(unit.passiveBonuses, bag) ?? bag;
    unit.passiveBonuses = merged;

    const newMaxHp = applyPassiveBonusToBase(rawMaxHp, bag.maxHealth);
    unit.maxHp = newMaxHp;
    // Fresh spawns are at full HP; keep ratio if somehow already damaged.
    if (unit.hp >= rawMaxHp) {
        unit.hp = newMaxHp;
    } else if (rawMaxHp > 0) {
        unit.hp = Math.min(newMaxHp, Math.floor((unit.hp / rawMaxHp) * newMaxHp));
    }

    const dmg = bag.all_damage;
    if (dmg && (dmg.add !== 0 || dmg.mult !== DEFAULT_PASSIVE_MULT)) {
        const prev = unit.combatSettings?.damageModifier ?? { flatAmt: 0, multiplier: DEFAULT_PASSIVE_MULT };
        unit.combatSettings = {
            ...unit.combatSettings,
            damageModifier: {
                flatAmt: prev.flatAmt + dmg.add,
                multiplier: prev.multiplier * dmg.mult,
            },
        };
    }
}

/**
 * Compile `spawnTweak` / `worldModifier` effects into WorldModifierDef[] for the campaign WM lane.
 * Stat bags stay on {@link compileStatBags}; this is only the declarative WM surface.
 */
export function compileWorldModifiers(active: readonly ActiveDarknessStrength[]): WorldModifierDef[] {
    const result: WorldModifierDef[] = [];

    for (const { packageId, def } of active) {
        const spawnEffects: SpawnUnitsEffect[] = [];
        for (const effect of def.compile) {
            if (effect.type === 'spawnTweak' && effect.everyRound) {
                spawnEffects.push({
                    type: 'spawnUnits',
                    characterId: effect.characterId,
                    count: effect.count,
                    spawnBehaviour: effect.spawnBehaviour,
                    inDarkness: effect.inDarkness,
                });
            } else if (effect.type === 'worldModifier') {
                if (effect.def) {
                    result.push(effect.def);
                }
                // presetId resolution deferred — starters do not use worldModifier effects.
            }
        }
        if (spawnEffects.length === 0) continue;
        result.push({
            id: packageId,
            name: def.name,
            description: def.description,
            icon: def.icon,
            rules: {
                on_round_start: [
                    {
                        conditions: [{ type: 'always' }],
                        effects: spawnEffects,
                    },
                ],
            },
        });
    }

    return result;
}
