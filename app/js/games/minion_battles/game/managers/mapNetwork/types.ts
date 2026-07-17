import type { ResolvedNetworkNode } from '../../../terrain/segmentRegistry';
import type { NetworkEdgeDef } from '../../../terrain/networkSchema';

/**
 * Runtime shape of a single map-network node. Generic structural/query data only — no baked-in
 * AI behavior. `unitIds` is rebuilt from scratch every `MapNetworkManager.tick()` call from live
 * unit positions (mirrors `GroupManager`'s `unitIds: string[]` membership convention).
 */
export interface NetworkNode {
    id: string;
    x: number;
    y: number;
    radius: number;
    tags: readonly string[];
    unitIds: string[];
}

/** Undirected pair of node ids. */
export type NetworkEdge = readonly [string, string];

/** The resolved, mission-global-coordinate payload `MapNetworkManager.loadFromSegments` consumes — matches `getMissionSegmentNetwork`'s return shape exactly. */
export interface ResolvedMapNetwork {
    nodes: ResolvedNetworkNode[];
    edges: NetworkEdgeDef[];
}

/**
 * `MapNetworkManager`'s serialized form. Deliberately empty today: node/edge structure is always
 * rebuilt fresh by `loadFromSegments` during mission init (never from a checkpoint), and `unitIds`
 * membership repopulates itself on the next `tick()` call after any restore — so there is nothing
 * authoritative to persist yet. Kept as a real (if empty) type — rather than omitting
 * `toJSON`/`restoreFromJSON` entirely — so a future authoritative field has an obvious place to
 * land, and so this doesn't read as "forgot to serialize" the way `LanterniteRespawnManager`'s
 * total lack of serialization does (see `game/lanternite/LanterniteRespawnManager.ts`).
 */
export type SerializedMapNetwork = Record<string, never>;
