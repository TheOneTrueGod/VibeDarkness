/**
 * The castle around the 61_49 gate: segments 58-64 x 43-49 (7x7), built around the existing 61_49
 * Castle Gate and 61_48 Castle Courtyard. Each segment is 22x22; one file per segment.
 *
 * Plan (north at top). A moat and a 3-thick curtain wall ring the castle, with a wall walk inside it
 * and towers at the corners; the 5x5 inside is grouped into quarters. A straight walkway runs north
 * up col 61 from the gate to the throne, and a wing crosses the castle on row 46.
 *
 *          58           59              60              61               62              63              64
 *   43  NW tower     N wall walk     N stair tower   Royal treasury*  Observatory     N wall walk     NE tower
 *   44  wall walk    Royal bedchamber Royal guard    THRONE ROOM      [Queen's garden  Conservatory]  wall walk
 *   45  wall walk    Royal baths     War room        Chasm bridge     [Herb garden     Orchard     ]  wall walk
 *   46  Sally port = Portcullis    = Barracks      = Great hall     = Chapel nave   = Chapel altar  = E breach   (the wing)
 *   47  wall walk    Archery range   Gladiator pit   Grand foyer      [Great library  Alchemy lab  ]  wall walk
 *   48  wall walk    Kennels         Training yard   (Courtyard)      [Wizard's study Summoning circle] wall walk
 *   49  SW tower     Storerooms      W guardhouse    (Gate)           E guardhouse    Ice house       SE tower
 *
 *   Quarters: royal (upper left), garden (upper right, one 2x2 space round a pond), training grounds
 *   (lower left), arcane (lower right, one 2x2 space round the great summoning circle, with ley lines
 *   running in from each room's centrepiece).
 *   * the royal treasury is reached only by a 1-wide secret door behind the throne.
 *
 * Ways in: the 61_49 gate (south), the west sally port (58_46, bridge over the moat) and the east
 * breach (64_46, shallow ford). The courtyard (61_48) is walled off from its neighbours, so the
 * quarters are reached from the wing, the foyer's servant doors or the wall walks.
 *
 * Floors: Dirt marks the main routes through each room (door to door); Gravel marks the floor off them.
 * In the garden and arcane quarter, a Dirt loop round the centrepiece joins every door.
 * Network: one `{col}_{row}_center` node per segment, with an edge for every door between segments;
 * 61_47 links to the courtyard's `61_48_keep_door`.
 * Light spots: only the two dark-crystal braziers in the throne room.
 *
 * The segments were painted on one castle-wide canvas and sliced, so neighbouring edges always
 * match; `castle.test.ts` checks seams, reachability and POI/node placement.
 */

import type { CastleSegment } from './castleSegment';
import { SEGMENT_58_43_NORTHWEST_TOWER } from './58_43_northwest_tower';
import { SEGMENT_59_43_NORTH_WALL_WALK_WEST } from './59_43_north_wall_walk_west';
import { SEGMENT_60_43_NORTH_STAIR_TOWER } from './60_43_north_stair_tower';
import { SEGMENT_61_43_ROYAL_TREASURY } from './61_43_royal_treasury';
import { SEGMENT_62_43_OBSERVATORY } from './62_43_observatory';
import { SEGMENT_63_43_NORTH_WALL_WALK_EAST } from './63_43_north_wall_walk_east';
import { SEGMENT_64_43_NORTHEAST_TOWER } from './64_43_northeast_tower';
import { SEGMENT_58_44_WEST_WALL_WALK_GUARDROOM } from './58_44_west_wall_walk_guardroom';
import { SEGMENT_59_44_ROYAL_BEDCHAMBER } from './59_44_royal_bedchamber';
import { SEGMENT_60_44_ROYAL_GUARD_HALL } from './60_44_royal_guard_hall';
import { SEGMENT_61_44_THRONE_ROOM } from './61_44_throne_room';
import { SEGMENT_62_44_QUEENS_GARDEN } from './62_44_queens_garden';
import { SEGMENT_63_44_CONSERVATORY } from './63_44_conservatory';
import { SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM } from './64_44_east_wall_walk_guardroom';
import { SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES } from './58_45_west_wall_walk_murder_holes';
import { SEGMENT_59_45_ROYAL_BATHS } from './59_45_royal_baths';
import { SEGMENT_60_45_WAR_ROOM } from './60_45_war_room';
import { SEGMENT_61_45_CHASM_BRIDGE } from './61_45_chasm_bridge';
import { SEGMENT_62_45_HERB_GARDEN } from './62_45_herb_garden';
import { SEGMENT_63_45_ORCHARD } from './63_45_orchard';
import { SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES } from './64_45_east_wall_walk_murder_holes';
import { SEGMENT_58_46_WEST_SALLY_PORT } from './58_46_west_sally_port';
import { SEGMENT_59_46_PORTCULLIS_HALL } from './59_46_portcullis_hall';
import { SEGMENT_60_46_BARRACKS } from './60_46_barracks';
import { SEGMENT_61_46_GREAT_HALL } from './61_46_great_hall';
import { SEGMENT_62_46_CHAPEL_NAVE } from './62_46_chapel_nave';
import { SEGMENT_63_46_CHAPEL_ALTAR } from './63_46_chapel_altar';
import { SEGMENT_64_46_EAST_BREACH } from './64_46_east_breach';
import { SEGMENT_58_47_WEST_WALL_WALK_LATRINE } from './58_47_west_wall_walk_latrine';
import { SEGMENT_59_47_ARCHERY_RANGE } from './59_47_archery_range';
import { SEGMENT_60_47_GLADIATOR_PIT } from './60_47_gladiator_pit';
import { SEGMENT_61_47_GRAND_FOYER } from './61_47_grand_foyer';
import { SEGMENT_62_47_GREAT_LIBRARY } from './62_47_great_library';
import { SEGMENT_63_47_ALCHEMY_LAB } from './63_47_alchemy_lab';
import { SEGMENT_64_47_EAST_WALL_WALK_LATRINE } from './64_47_east_wall_walk_latrine';
import { SEGMENT_58_48_WEST_WALL_WALK_WELL } from './58_48_west_wall_walk_well';
import { SEGMENT_59_48_KENNELS } from './59_48_kennels';
import { SEGMENT_60_48_TRAINING_YARD } from './60_48_training_yard';
import { SEGMENT_62_48_WIZARDS_STUDY } from './62_48_wizards_study';
import { SEGMENT_63_48_SUMMONING_CIRCLE } from './63_48_summoning_circle';
import { SEGMENT_64_48_EAST_WALL_WALK_WELL } from './64_48_east_wall_walk_well';
import { SEGMENT_58_49_SOUTHWEST_TOWER } from './58_49_southwest_tower';
import { SEGMENT_59_49_STOREROOMS } from './59_49_storerooms';
import { SEGMENT_60_49_WEST_GUARDHOUSE } from './60_49_west_guardhouse';
import { SEGMENT_62_49_EAST_GUARDHOUSE } from './62_49_east_guardhouse';
import { SEGMENT_63_49_ICE_HOUSE } from './63_49_ice_house';
import { SEGMENT_64_49_SOUTHEAST_TOWER } from './64_49_southeast_tower';

/** Every castle segment except the existing 61_49 gate and 61_48 courtyard, north to south. */
export const CASTLE_SEGMENTS: CastleSegment[] = [
    SEGMENT_58_43_NORTHWEST_TOWER,
    SEGMENT_59_43_NORTH_WALL_WALK_WEST,
    SEGMENT_60_43_NORTH_STAIR_TOWER,
    SEGMENT_61_43_ROYAL_TREASURY,
    SEGMENT_62_43_OBSERVATORY,
    SEGMENT_63_43_NORTH_WALL_WALK_EAST,
    SEGMENT_64_43_NORTHEAST_TOWER,
    SEGMENT_58_44_WEST_WALL_WALK_GUARDROOM,
    SEGMENT_59_44_ROYAL_BEDCHAMBER,
    SEGMENT_60_44_ROYAL_GUARD_HALL,
    SEGMENT_61_44_THRONE_ROOM,
    SEGMENT_62_44_QUEENS_GARDEN,
    SEGMENT_63_44_CONSERVATORY,
    SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM,
    SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES,
    SEGMENT_59_45_ROYAL_BATHS,
    SEGMENT_60_45_WAR_ROOM,
    SEGMENT_61_45_CHASM_BRIDGE,
    SEGMENT_62_45_HERB_GARDEN,
    SEGMENT_63_45_ORCHARD,
    SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES,
    SEGMENT_58_46_WEST_SALLY_PORT,
    SEGMENT_59_46_PORTCULLIS_HALL,
    SEGMENT_60_46_BARRACKS,
    SEGMENT_61_46_GREAT_HALL,
    SEGMENT_62_46_CHAPEL_NAVE,
    SEGMENT_63_46_CHAPEL_ALTAR,
    SEGMENT_64_46_EAST_BREACH,
    SEGMENT_58_47_WEST_WALL_WALK_LATRINE,
    SEGMENT_59_47_ARCHERY_RANGE,
    SEGMENT_60_47_GLADIATOR_PIT,
    SEGMENT_61_47_GRAND_FOYER,
    SEGMENT_62_47_GREAT_LIBRARY,
    SEGMENT_63_47_ALCHEMY_LAB,
    SEGMENT_64_47_EAST_WALL_WALK_LATRINE,
    SEGMENT_58_48_WEST_WALL_WALK_WELL,
    SEGMENT_59_48_KENNELS,
    SEGMENT_60_48_TRAINING_YARD,
    SEGMENT_62_48_WIZARDS_STUDY,
    SEGMENT_63_48_SUMMONING_CIRCLE,
    SEGMENT_64_48_EAST_WALL_WALK_WELL,
    SEGMENT_58_49_SOUTHWEST_TOWER,
    SEGMENT_59_49_STOREROOMS,
    SEGMENT_60_49_WEST_GUARDHOUSE,
    SEGMENT_62_49_EAST_GUARDHOUSE,
    SEGMENT_63_49_ICE_HOUSE,
    SEGMENT_64_49_SOUTHEAST_TOWER,
];
