import { z } from 'zod';

/**
 * Segment-local placement for a network node. `gridPoint` snaps to a terrain grid cell (matches
 * `MapSegmentPOI`'s col/row convention); `pixelPoint` is a raw segment-local pixel offset for
 * sub-cell placement (e.g. a nest sitting slightly off-grid).
 */
export const NetworkNodePositionSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('gridPoint'), col: z.number().int(), row: z.number().int() }),
    z.object({ kind: z.literal('pixelPoint'), x: z.number(), y: z.number() }),
]);
export type NetworkNodePosition = z.infer<typeof NetworkNodePositionSchema>;

/**
 * A node in a map's connectivity graph (e.g. a lanternite nest site). Unlike `position`, `radius`
 * is **not** resolved from grid cells to pixels by `segmentRegistry.getMissionSegmentNetwork` — it
 * is passed through verbatim into `ResolvedNetworkNode.radius` / `NetworkNode.radius`, which is
 * compared directly against mission-global pixel distances in
 * `MapNetworkManager.findNodeContainingPosition`. So author `radius` in **pixels**, not grid
 * cells: this only mirrors `MapSegmentPOI.radius`'s optionality/no-baked-default convention, not
 * its units. Optional, no default baked into the schema — resolution-time consumers (see
 * `segmentRegistry.getMissionSegmentNetwork`) apply whatever undefined-radius fallback is already
 * established elsewhere (e.g. `spawnUnit.ts`'s `placement.radius ?? 0`) rather than inventing a
 * new default here.
 */
export const NetworkNodeDefSchema = z.object({
    id: z.string(),
    position: NetworkNodePositionSchema,
    radius: z.number().nonnegative().optional(),
    tags: z.array(z.string()).optional(),
});
export type NetworkNodeDef = z.infer<typeof NetworkNodeDefSchema>;

/** Undirected pair of node ids. */
export const NetworkEdgeDefSchema = z.tuple([z.string(), z.string()]);
export type NetworkEdgeDef = z.infer<typeof NetworkEdgeDefSchema>;

/**
 * A segment's contribution to the mission-wide network graph: its own nodes plus edges between
 * them (or to nodes defined in other segments — resolved and validated at mission-assembly time
 * by `segmentRegistry.getMissionSegmentNetwork`, not here).
 */
export const MapSegmentNetworkSchema = z.object({
    nodes: z.array(NetworkNodeDefSchema).default([]),
    edges: z.array(NetworkEdgeDefSchema).default([]),
});
export type MapSegmentNetwork = z.infer<typeof MapSegmentNetworkSchema>;
