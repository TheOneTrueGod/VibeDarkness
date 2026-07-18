import type { Unit } from '../../units/Unit';
import { getUnitParticipatesInMapNetwork } from '../../units/unit_defs/unitDef';
import type {
    NetworkEdge,
    NetworkNode,
    ResolvedMapNetwork,
    SerializedMapNetwork,
} from './types';

/**
 * Generic graph of map "network" nodes (e.g. lanternite nest sites) — node/edge structure plus
 * per-node unit membership, exposed as a read-only query surface for AI trees and nest-tick
 * logic. Deliberately holds structural/query data only; decision logic (which role a unit gets,
 * whether a site is "contested", etc.) stays in the callers that consume these queries.
 *
 * Structural template: mirrors `GroupManager`'s `groupId`-keyed / plain `unitIds: string[]`
 * membership pattern. Opt-in template: mirrors `CellOccupancyManager`'s data-driven
 * "managed purely because a unit-def field says so" convention (wired in Step 5).
 */
export class MapNetworkManager {
    private nodes: Map<string, NetworkNode> = new Map();
    private edges: NetworkEdge[] = [];
    private adjacency: Map<string, Set<string>> = new Map();
    /** Last node id each participating unit was recorded in, for `updateUnitNode`'s incremental
     *  diff. Absent entry = not currently in any node (never registered, or unregistered). */
    private lastKnownNodeIdByUnitId: Map<string, string> = new Map();

    /**
     * Clears and rebuilds nodes/edges/adjacency from a resolved segment network (see
     * `segmentRegistry.getMissionSegmentNetwork`). Idempotent; safe to call with an empty payload
     * — missions with no network data simply get a harmlessly empty graph (every query returns
     * `undefined`/`[]`).
     */
    loadFromSegments(resolved: ResolvedMapNetwork): void {
        this.nodes.clear();
        this.edges = [];
        this.adjacency.clear();
        this.lastKnownNodeIdByUnitId.clear();

        for (const node of resolved.nodes) {
            this.nodes.set(node.id, {
                id: node.id,
                x: node.x,
                y: node.y,
                radius: node.radius,
                tags: node.tags,
                unitIds: [],
            });
            this.adjacency.set(node.id, new Set());
        }

        for (const [a, b] of resolved.edges) {
            // getMissionSegmentNetwork already drops edges with unknown endpoints, but this is a
            // public entry point — guard defensively rather than trusting every caller.
            if (!this.nodes.has(a) || !this.nodes.has(b)) continue;
            this.edges.push([a, b]);
            this.adjacency.get(a)?.add(b);
            this.adjacency.get(b)?.add(a);
        }
    }

    // --- Query API (read-only, generic) ---

    getNode(id: string): NetworkNode | undefined {
        return this.nodes.get(id);
    }

    getNeighborIds(id: string): string[] {
        const neighbors = this.adjacency.get(id);
        return neighbors ? Array.from(neighbors) : [];
    }

    getNeighborNodes(id: string): NetworkNode[] {
        return this.getNeighborIds(id)
            .map((neighborId) => this.nodes.get(neighborId))
            .filter((node): node is NetworkNode => node != null);
    }

    /**
     * Finds the node whose radius contains (x, y). When multiple node radii overlap the point,
     * the node whose center is closest to (x, y) wins the tie-break.
     */
    findNodeContainingPosition(x: number, y: number): NetworkNode | undefined {
        let best: NetworkNode | undefined;
        let bestDistSq = Infinity;
        for (const node of this.nodes.values()) {
            const dx = node.x - x;
            const dy = node.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq > node.radius * node.radius) continue;
            if (distSq < bestDistSq) {
                best = node;
                bestDistSq = distSq;
            }
        }
        return best;
    }

    findNodeForUnit(unitId: string): NetworkNode | undefined {
        for (const node of this.nodes.values()) {
            if (node.unitIds.includes(unitId)) return node;
        }
        return undefined;
    }

    getUnitIdsInNode(id: string): readonly string[] {
        return this.nodes.get(id)?.unitIds ?? [];
    }

    /**
     * Derived view: resolves this node's `unitIds` against `units` and tallies by `characterId`.
     * Takes `units` as a param rather than holding a reference, matching `GroupManager.tick`'s
     * pattern.
     */
    getUnitCountsByCharacterId(id: string, units: readonly Unit[]): Map<string, number> {
        const counts = new Map<string, number>();
        const unitIds = this.getUnitIdsInNode(id);
        if (unitIds.length === 0) return counts;
        const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
        for (const unitId of unitIds) {
            const unit = unitById.get(unitId);
            if (!unit) continue;
            counts.set(unit.characterId, (counts.get(unit.characterId) ?? 0) + 1);
        }
        return counts;
    }

    /**
     * Derived: the sole `characterId` occupying this node, or `undefined` if the node is empty OR
     * contested by 2+ distinct `characterId`s — "contested" is meaningfully different from
     * "owned" for callers, so both cases collapse to `undefined` rather than picking an arbitrary
     * winner.
     */
    getOwnerCharacterId(id: string, units: readonly Unit[]): string | undefined {
        const counts = this.getUnitCountsByCharacterId(id, units);
        if (counts.size !== 1) return undefined;
        return Array.from(counts.keys())[0];
    }

    getAllNodeIds(): string[] {
        return Array.from(this.nodes.keys());
    }

    /**
     * Full rebuild: clears every node's `unitIds` and reassigns each active, alive, participating
     * unit to whichever node's radius contains its current position (if any). Intended to run
     * exactly twice per battle — once after mission-init unit spawning
     * (`BaseMissionDef.initializeGameState`) and once after checkpoint/resync unit restoration
     * (`GameEngine.fromJSON`) — NOT once per simulation tick. Steady-state updates happen
     * incrementally via `updateUnitNode`/`unregisterUnit` instead (see those methods' doc
     * comments for why: this used to run every tick and was changed to avoid an O(all nodes +
     * all units) rebuild every frame).
     *
     * Units are only membership candidates when their unit def opts in
     * (`getUnitParticipatesInMapNetwork`) — non-participating units are invisible to the network,
     * exactly as unmanaged units are invisible to `CellOccupancyManager`.
     */
    buildInitialMembership(units: readonly Unit[]): void {
        for (const node of this.nodes.values()) {
            node.unitIds = [];
        }
        this.lastKnownNodeIdByUnitId.clear();
        for (const unit of units) {
            if (!unit.active || !unit.isAlive()) continue;
            if (!getUnitParticipatesInMapNetwork(unit.characterId)) continue;
            const node = this.findNodeContainingPosition(unit.x, unit.y);
            if (!node) continue;
            node.unitIds.push(unit.id);
            this.lastKnownNodeIdByUnitId.set(unit.id, node.id);
        }
    }

    /**
     * Incremental per-unit steady-state update — the replacement for a per-tick full rebuild.
     * Called once per unit per simulation tick, right after that unit's movement is fully
     * resolved for the tick (`UnitManager.gameTick`'s Phase 2 loop), so it acts as the unit
     * "notifying" the manager of a node change rather than the manager rescanning everyone.
     * Diffs the unit's currently-resolved node against `lastKnownNodeIdByUnitId` and only touches
     * the two affected nodes' `unitIds` arrays when membership actually changed — a no-op fast
     * path otherwise. Dead/inactive/non-participating units are unregistered rather than placed.
     */
    updateUnitNode(unit: Unit): void {
        if (!getUnitParticipatesInMapNetwork(unit.characterId)) return;
        if (!unit.active || !unit.isAlive()) {
            this.unregisterUnit(unit.id);
            return;
        }

        const newNodeId = this.findNodeContainingPosition(unit.x, unit.y)?.id;
        const lastNodeId = this.lastKnownNodeIdByUnitId.get(unit.id);
        if (newNodeId === lastNodeId) return;

        if (lastNodeId != null) {
            const oldNode = this.nodes.get(lastNodeId);
            if (oldNode) oldNode.unitIds = oldNode.unitIds.filter((id) => id !== unit.id);
        }
        if (newNodeId != null) {
            this.nodes.get(newNodeId)?.unitIds.push(unit.id);
            this.lastKnownNodeIdByUnitId.set(unit.id, newNodeId);
        } else {
            this.lastKnownNodeIdByUnitId.delete(unit.id);
        }
    }

    /**
     * Removes `unitId` from whichever node it's currently cached in (no-op if it was never
     * registered) and clears the cache entry. Shared by `updateUnitNode`'s dead-unit branch and
     * the `unit_died` EventBus hook in `GameEngine.registerCoreEventListeners` — the explicit
     * event hook exists because a dead unit's position typically never changes again after death,
     * so `updateUnitNode`'s per-tick diff might never re-fire to clean it up on its own.
     */
    unregisterUnit(unitId: string): void {
        const lastNodeId = this.lastKnownNodeIdByUnitId.get(unitId);
        if (lastNodeId != null) {
            const node = this.nodes.get(lastNodeId);
            if (node) node.unitIds = node.unitIds.filter((id) => id !== unitId);
        }
        this.lastKnownNodeIdByUnitId.delete(unitId);
    }

    /**
     * Ownership/membership are fully derived, never serialized: node positions/edges are always
     * freshly rebuilt by `loadFromSegments` during `initializeGameState` (never from a
     * checkpoint), and `unitIds` repopulates itself via `buildInitialMembership` immediately after
     * any restore (see `GameEngine.fromJSON`), then stays current via `updateUnitNode`. This
     * method (and `restoreFromJSON`) exist for interface consistency with other managers and
     * to leave room for future authoritative state — they are deliberate no-ops today, not an
     * oversight. Contrast `LanterniteRespawnManager`, which has no serialization at all and
     * silently drops its respawn queue on every checkpoint reload; this comment exists so
     * `MapNetworkManager` doesn't read the same way by omission.
     */
    toJSON(): SerializedMapNetwork {
        return {};
    }

    restoreFromJSON(_data: SerializedMapNetwork | undefined): void {
        // Intentional no-op — see toJSON's doc comment above.
    }
}
