/**
 * ObjectiveManager — mission-defined battle objectives (UI + completion tracking).
 * Evaluated on the host tick; state is serialized in checkpoints.
 */

import type { EngineContext } from '../EngineContext';
import type {
    BattleObjectiveDef,
    ObjectiveOnCompleteEffect,
    VictoryCondition,
} from '../../storylines/types';

export interface SerializedObjectiveState {
    completedIds: string[];
    revealedIds: string[];
}

export class ObjectiveManager {
    private defs: BattleObjectiveDef[] = [];
    private defById = new Map<string, BattleObjectiveDef>();
    private completedIds = new Set<string>();
    private revealedIds = new Set<string>();
    private snapshotImport: SerializedObjectiveState | null = null;
    private onEmitMessage: ((text: string, npcId?: string) => void) | null = null;

    constructor(private readonly ctx: EngineContext) {}

    setOnEmitMessage(cb: ((text: string, npcId?: string) => void) | null): void {
        this.onEmitMessage = cb;
    }

    /** Stash checkpoint payload; merged when {@link setDefs} runs (after mission defs are known). */
    importSnapshot(raw: unknown): void {
        if (!raw || typeof raw !== 'object') {
            this.snapshotImport = null;
            return;
        }
        const o = raw as Record<string, unknown>;
        const completedIds = Array.isArray(o.completedIds)
            ? (o.completedIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
        const revealedIds = Array.isArray(o.revealedIds)
            ? (o.revealedIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
        this.snapshotImport = { completedIds, revealedIds };
    }

    /** Replace defs and init or merge checkpoint state. */
    setDefs(defs: BattleObjectiveDef[]): void {
        this.defs = defs;
        this.defById = new Map(defs.map((d) => [d.id, d]));
        this.completedIds.clear();
        this.revealedIds.clear();

        if (this.snapshotImport) {
            for (const id of this.snapshotImport.completedIds) {
                if (this.defById.has(id)) this.completedIds.add(id);
            }
            for (const id of this.snapshotImport.revealedIds) {
                if (this.defById.has(id)) this.revealedIds.add(id);
            }
            this.snapshotImport = null;
        } else {
            for (const d of defs) {
                const hiddenInitially = d.revealedInitially === false;
                if (!d.requiresCompletedId && !hiddenInitially) this.revealedIds.add(d.id);
            }
        }
        this.syncRevealedFromPrerequisites();
    }

    private syncRevealedFromPrerequisites(): void {
        let changed = true;
        while (changed) {
            changed = false;
            for (const d of this.defs) {
                if (this.revealedIds.has(d.id) || this.completedIds.has(d.id)) continue;
                const req = d.requiresCompletedId;
                if (req && this.completedIds.has(req) && this.defById.has(d.id)) {
                    this.revealedIds.add(d.id);
                    changed = true;
                }
            }
        }
    }

    getDisplayRows(): { id: string; label: string; completed: boolean }[] {
        const rows: { id: string; label: string; completed: boolean }[] = [];
        for (const d of this.defs) {
            if (!this.revealedIds.has(d.id)) continue;
            rows.push({
                id: d.id,
                label: d.label,
                completed: this.completedIds.has(d.id),
            });
        }
        return rows;
    }

    /** Reveal hidden objectives mid-battle (e.g. LAN quest defend phase). Public for LevelEventManager. */
    revealObjectiveIds(ids: readonly string[]): void {
        let changed = false;
        for (const id of ids) {
            if (!this.defById.has(id)) continue;
            if (this.revealedIds.has(id)) continue;
            this.revealedIds.add(id);
            changed = true;
        }
        if (changed) this.syncRevealedFromPrerequisites();
    }

    /** Run after level events; respects story pause like other mission logic. */
    processObjectives(): void {
        if (this.ctx.storyPauseActive || this.defs.length === 0) return;

        this.syncRevealedFromPrerequisites();

        for (const d of this.defs) {
            if (!this.revealedIds.has(d.id) || this.completedIds.has(d.id)) continue;
            if (this.evaluateCondition(d.toComplete)) {
                this.completedIds.add(d.id);
                this.applyOnComplete(d.onComplete);
                this.syncRevealedFromPrerequisites();
            }
        }
    }

    private evaluateCondition(cond: VictoryCondition): boolean {
        if (cond.type === 'eliminateAllEnemies') {
            const hasEnemies = this.ctx.units.some((u) => u.isAlive() && u.teamId === 'enemy');
            return !hasEnemies;
        }
        if (cond.type === 'allUnitsNearPosition') {
            const maxDist = cond.maxDistance ?? 1;
            const alivePlayers = this.ctx.units.filter((u) => u.isPlayerControlled() && u.isAlive());
            if (alivePlayers.length === 0) return false;
            const grid = this.ctx.terrainManager?.grid;
            if (!grid) return false;
            return alivePlayers.every((u) => {
                const { col: uc, row: ur } = grid.worldToGrid(u.x, u.y);
                return Math.max(Math.abs(uc - cond.col), Math.abs(ur - cond.row)) <= maxDist;
            });
        }
        if (cond.type === 'unitDead') {
            const hasTargetAlive = this.ctx.units.some(
                (u) => u.isAlive() && u.characterId === cond.unitCharacterId,
            );
            return !hasTargetAlive;
        }
        if (cond.type === 'atLeastRound') {
            return this.ctx.roundNumber >= cond.round;
        }
        return false;
    }

    private applyOnComplete(effects: ObjectiveOnCompleteEffect[] | undefined): void {
        if (!effects?.length) return;
        for (const e of effects) {
            if (e.type === 'revealObjective') {
                if (this.defById.has(e.id)) this.revealedIds.add(e.id);
            } else if (e.type === 'npcChat') {
                this.onEmitMessage?.(e.text, e.npcId);
            }
        }
    }

    toJSON(): SerializedObjectiveState {
        return {
            completedIds: [...this.completedIds],
            revealedIds: [...this.revealedIds],
        };
    }

    restoreFromJSON(data: Partial<SerializedObjectiveState> | undefined): void {
        if (!data) return;
        if (Array.isArray(data.completedIds)) {
            this.completedIds = new Set(data.completedIds.filter((id) => this.defById.has(id)));
        }
        if (Array.isArray(data.revealedIds)) {
            this.revealedIds = new Set(data.revealedIds.filter((id) => this.defById.has(id)));
        }
        this.syncRevealedFromPrerequisites();
    }
}
