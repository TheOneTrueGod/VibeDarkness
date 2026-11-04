/**
 * Deployable: a lightweight view of something that exists on the map and that abilities can find
 * and interact with. Stores (lights, terrain effects, special tiles) keep their own data and
 * expose deployables through a DeployableProvider.
 */
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { TeamId } from '../teams';

export type DeployableKind = 'lightSource' | 'terrainEffect' | 'specialTile' | 'droppedWeapon' | 'placedDeployable';

/**
 * `conductor`: metal on the ground that carries lightning (dropped weapons, placed deployables). Chain
 * effects may relay through a conductor as a free hop (Storm Core: Chain Lightning).
 */
export type DeployableTag = 'lightEmitter' | 'bramble' | 'droppedWeapon' | 'placedDeployable' | 'conductor';

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
    /**
     * Content-defined type within the kind, e.g. a dropped weapon's token kind (`sword`) or a
     * placed deployable's def id. Abilities that act on "every token of a type" (Echo) match on it.
     */
    subtype?: string;
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
    /** Only deployables with this `subtype`. */
    subtype?: string;
    /** Only deployables this unit owns. */
    ownerUnitId?: string;
    /** Default false. */
    includeInactive?: boolean;
}

/** The 5x5-tile square around the caster. */
export const REACH_5X5_HALF_EXTENT = 2 * CELL_SIZE;
