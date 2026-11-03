/**
 * TriggerManager — runs mission `TriggerDef`s each sim tick: detects events, checks conditions,
 * and executes actions through a host (LevelEventManager supplies spawning and messaging).
 *
 * State (fire counts, enable overrides, who is inside each region) is plain data and round-trips
 * through `toJSON` / `restoreFromJSON` inside the level-event checkpoint fields.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { Unit } from '../units/Unit';
import type { EnemySpawnDef, SpawnWaveEntry } from '../../storylines/types';
import { evaluateTriggerCondition, type MissionConditionContext } from './missionConditions';
import type {
    TriggerAction,
    TriggerActionSpawnWave,
    TriggerDef,
    TriggerEvent,
    TriggerRegion,
    TriggerUnitFilter,
} from './triggerTypes';

/** What actions need from the engine. */
export interface TriggerActionHost {
    spawnWave(spawns: SpawnWaveEntry[], extraEnemySpawns: EnemySpawnDef[] | undefined): void;
    emitMessage(text: string, npcId?: string): void;
    revealObjectives(ids: readonly string[]): void;
}

/** One occurrence of an event, with the unit that caused it (if any). */
interface TriggerFiring {
    triggeringUnit: Unit | null;
}

export interface SerializedTriggerState {
    fireCounts: Record<string, number>;
    enabledOverrides: Record<string, boolean>;
    /** `${triggerId}#${eventIndex}` -> unit ids inside that event's region at the last check. */
    insideUnitIds: Record<string, string[]>;
}

export function isUnitInRegion(unit: Pick<Unit, 'x' | 'y'>, region: TriggerRegion): boolean {
    if (region.type === 'circle') {
        const dx = unit.x - region.x;
        const dy = unit.y - region.y;
        return dx * dx + dy * dy <= region.radiusPx * region.radiusPx;
    }
    const col = Math.floor(unit.x / CELL_SIZE);
    const row = Math.floor(unit.y / CELL_SIZE);
    return col >= region.col && col < region.col + region.width && row >= region.row && row < region.row + region.height;
}

export function unitMatchesTriggerFilter(unit: Unit, filter: TriggerUnitFilter | undefined): boolean {
    if (!filter) return true;
    if (filter.owner === 'anyPlayer' && !unit.isPlayerControlled()) return false;
    if (filter.owner === 'ai' && unit.isPlayerControlled()) return false;
    if (filter.teamId !== undefined && unit.teamId !== filter.teamId) return false;
    if (filter.characterId !== undefined && unit.characterId !== filter.characterId) return false;
    if (filter.tag !== undefined && !unit.tags.includes(filter.tag)) return false;
    return true;
}

/** Rewrite spawn entries to appear around a unit (keeps each entry's own `inDarkness`). */
function spawnsNearUnit(spawns: SpawnWaveEntry[], unit: Unit, radiusTiles: number): SpawnWaveEntry[] {
    return spawns.map((entry) => ({
        ...entry,
        spawnBehaviour: 'anywhere',
        spawnTarget: { x: unit.x, y: unit.y, radius: radiusTiles },
    }));
}

export class TriggerManager {
    private triggers: TriggerDef[] = [];
    private fireCounts: Record<string, number> = {};
    private enabledOverrides: Record<string, boolean> = {};
    private insideUnitIds: Record<string, Set<string>> = {};

    constructor(private readonly ctx: MissionConditionContext) {}

    /** Fresh battle: set definitions and clear all runtime state. */
    registerTriggers(triggers: TriggerDef[]): void {
        this.triggers = triggers;
        this.fireCounts = {};
        this.enabledOverrides = {};
        this.insideUnitIds = {};
    }

    /** Checkpoint restore: set definitions, keep the restored runtime state. */
    setTriggers(triggers: TriggerDef[]): void {
        this.triggers = triggers;
    }

    hasFired(triggerId: string): boolean {
        return (this.fireCounts[triggerId] ?? 0) > 0;
    }

    isEnabled(trigger: TriggerDef): boolean {
        return this.enabledOverrides[trigger.id] ?? trigger.enabled !== false;
    }

    /** Detect events and run triggers. Call once per sim tick. */
    process(host: TriggerActionHost): void {
        for (const trigger of this.triggers) {
            const firings = this.collectFirings(trigger);
            for (const firing of firings) {
                if (!this.isEnabled(trigger)) break;
                if (trigger.fireOnce !== false && this.hasFired(trigger.id)) break;
                if (!this.conditionsHold(trigger)) continue;
                this.fireCounts[trigger.id] = (this.fireCounts[trigger.id] ?? 0) + 1;
                for (const action of trigger.actions) this.runAction(action, firing, host);
            }
        }
    }

    /**
     * Event occurrences this tick. Region membership is tracked even while a trigger is disabled
     * or spent, so a unit already standing inside never counts as entering later.
     */
    private collectFirings(trigger: TriggerDef): TriggerFiring[] {
        const firings: TriggerFiring[] = [];
        trigger.events.forEach((event, eventIndex) => {
            firings.push(...this.collectEventFirings(`${trigger.id}#${eventIndex}`, event));
        });
        return firings;
    }

    private collectEventFirings(key: string, event: TriggerEvent): TriggerFiring[] {
        switch (event.type) {
            case 'unitEntersRegion': {
                const previous = this.insideUnitIds[key] ?? new Set<string>();
                const current = new Set<string>();
                const firings: TriggerFiring[] = [];
                for (const unit of this.ctx.units) {
                    if (!unit.isAlive() || !unitMatchesTriggerFilter(unit, event.unit)) continue;
                    if (!isUnitInRegion(unit, event.region)) continue;
                    current.add(unit.id);
                    if (!previous.has(unit.id)) firings.push({ triggeringUnit: unit });
                }
                this.insideUnitIds[key] = current;
                return firings;
            }
        }
    }

    private conditionsHold(trigger: TriggerDef): boolean {
        return (trigger.conditions ?? []).every((c) =>
            evaluateTriggerCondition(this.ctx, c, (id) => this.hasFired(id)),
        );
    }

    private runAction(action: TriggerAction, firing: TriggerFiring, host: TriggerActionHost): void {
        switch (action.type) {
            case 'spawnWave':
                host.spawnWave(this.resolveSpawns(action, firing), action.extraEnemySpawns);
                return;
            case 'message':
                host.emitMessage(action.text, action.npcId);
                return;
            case 'revealObjectives':
                host.revealObjectives(action.objectiveIds);
                return;
            case 'setTriggerEnabled':
                this.enabledOverrides[action.triggerId] = action.enabled;
                return;
        }
    }

    private resolveSpawns(action: TriggerActionSpawnWave, firing: TriggerFiring): SpawnWaveEntry[] {
        if (!action.nearTriggeringUnit || !firing.triggeringUnit) return action.spawns;
        return spawnsNearUnit(action.spawns, firing.triggeringUnit, action.nearTriggeringUnit.radiusTiles);
    }

    toJSON(): SerializedTriggerState {
        return {
            fireCounts: { ...this.fireCounts },
            enabledOverrides: { ...this.enabledOverrides },
            insideUnitIds: Object.fromEntries(
                Object.entries(this.insideUnitIds).map(([k, ids]) => [k, [...ids].sort()]),
            ),
        };
    }

    restoreFromJSON(data: SerializedTriggerState | undefined): void {
        this.fireCounts = { ...(data?.fireCounts ?? {}) };
        this.enabledOverrides = { ...(data?.enabledOverrides ?? {}) };
        this.insideUnitIds = Object.fromEntries(
            Object.entries(data?.insideUnitIds ?? {}).map(([k, ids]) => [k, new Set(ids)]),
        );
    }
}
