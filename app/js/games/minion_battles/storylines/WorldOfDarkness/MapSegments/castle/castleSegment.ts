import type { TerrainType } from '../../../../terrain/TerrainType';
import type { MapSegmentPOI } from '../../../../terrain/segmentSchema';
import type { MapSegmentNetwork } from '../../../../terrain/networkSchema';

/** One castle segment: terrain plus its POIs and network, registered by `registerSegments.ts`. */
export interface CastleSegment {
    id: string;
    gridCol: number;
    gridRow: number;
    /** What the room is and what it was used for, in one to three sentences. */
    description: string;
    terrain: TerrainType[][];
    pointsOfInterest: MapSegmentPOI[];
    network: MapSegmentNetwork;
}
