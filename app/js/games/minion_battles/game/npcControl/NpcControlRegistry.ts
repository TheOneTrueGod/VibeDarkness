/**
 * Player control of NPC units, moved out of `GameEngine` as a pure move.
 *
 * Mission `playerControl` defs are runtime-only (re-registered after a checkpoint restore); the
 * group -> player `assignments` are checkpointed as `SerializedGameState.npcControlAssignments`.
 * `GameEngine` keeps `registerPlayerControl`, `getNpcControlAssignments`, `assignControl` and
 * `releaseControl` as delegates.
 */

import type { PlayerControlDef } from '../../storylines/types';
import type { EventBus } from '../EventBus';
import type { Unit } from '../units/Unit';

export class NpcControlRegistry {
    /** Mission playerControl defs (runtime-only). */
    private defs: PlayerControlDef[] = [];
    /** groupId -> playerId. Serialized by `engineSerialization.ts`. */
    assignments: Record<string, string> = {};

    constructor(private readonly eventBus: EventBus) {}

    /**
     * Register mission playerControl defs and group→player assignments.
     * Defs are runtime-only; assignments are serialized in checkpoints.
     */
    registerPlayerControl(defs: PlayerControlDef[], assignmentsByGroup: Record<string, string>): void {
        this.defs = defs.slice();
        this.assignments = { ...assignmentsByGroup };
    }

    /** Checkpointed groupId → playerId map (empty when no NPC control is active). */
    getNpcControlAssignments(): Readonly<Record<string, string>> {
        return this.assignments;
    }

    /**
     * Assign a unit to a player for NPC control. Stamps controlGroupId when provided.
     */
    assignControl(unit: Unit, playerId: string, groupId?: string | null): void {
        unit.ownerId = playerId;
        if (groupId != null) {
            unit.controlGroupId = groupId;
        }
        this.eventBus.emit('control_assigned', {
            unitId: unit.id,
            playerId,
            groupId: unit.controlGroupId,
        });
    }

    /**
     * Release a unit back to AI control. Facilitates future transfer/release UI.
     */
    releaseControl(unit: Unit): void {
        const previousPlayerId = unit.ownerId === 'ai' ? null : unit.ownerId;
        const groupId = unit.controlGroupId;
        unit.ownerId = 'ai';
        this.eventBus.emit('control_released', {
            unitId: unit.id,
            playerId: previousPlayerId,
            groupId,
        });
    }

    /** Resolved group id for a PlayerControlDef: id ?? controlGroupId ?? unitTag. */
    private static resolvePlayerControlGroupId(def: PlayerControlDef): string | null {
        return def.id ?? def.controlGroupId ?? def.unitTag ?? null;
    }

    /**
     * If the unit is AI-owned, controllable, and matches a registered control group with an
     * assigned player, hand ownership to that player.
     */
    tryAssignNpcControlOnSpawn(unit: Unit): void {
        if (unit.ownerId !== 'ai' || unit.controllable === false) return;
        if (this.defs.length === 0) return;

        for (const def of this.defs) {
            const groupId = NpcControlRegistry.resolvePlayerControlGroupId(def);
            if (groupId == null) continue;
            const playerId = this.assignments[groupId];
            if (playerId == null) continue;

            const matchesGroupId = unit.controlGroupId != null && unit.controlGroupId === groupId;
            const matchesTag = def.unitTag != null && unit.tags.includes(def.unitTag);
            if (matchesGroupId || matchesTag) {
                this.assignControl(unit, playerId, groupId);
                return;
            }
        }
    }
}
