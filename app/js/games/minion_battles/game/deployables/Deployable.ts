/**
 * Deployable: a lightweight view of something that exists on the map and that abilities can find
 * and interact with. Stores (lights, terrain effects, special tiles) keep their own data and
 * expose deployables through a DeployableProvider.
 */
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { TeamId } from '../teams';

export type DeployableKind = 'lightSource' | 'terrainEffect' | 'specialTile';

export type DeployableTag = 'lightEmitter' | 'bramble';

export interface Deployable {
    id: string;
    kind: DeployableKind;
    x: number;
    y: number;
    active: boolean;
    ownerUnitId?: string;
    ownerAbilityId?: string;
    teamId?: TeamId;
    tags: readonly DeployableTag[];
}

export interface DeployableQuery {
    /** Only deployables with `teamId === castingTeam` match; ownerless ones never do. */
    castingTeam: TeamId;
    /** Sort origin (nearest-first, stable id tie-break). */
    near: { x: number; y: number };
    /** Chebyshev square half-extent around `near`. */
    halfExtent?: number;
    /** Optional circular reach around `near`. */
    radius?: number;
    /** All listed tags must be present. */
    tags?: DeployableTag[];
    /** Default false. */
    includeInactive?: boolean;
}

/** The 5x5-tile square around the caster. */
export const REACH_5X5_HALF_EXTENT = 2 * CELL_SIZE;
