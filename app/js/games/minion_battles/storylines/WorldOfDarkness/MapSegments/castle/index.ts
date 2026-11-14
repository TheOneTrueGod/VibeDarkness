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
 *   44  wall walk~ = [Master bedroom  Royal solar ]  THRONE ROOM      [Great library  Alchemy lab  ] = wall walk~
 *   45  wall walk~   [Royal baths     Privy chamber]  Chasm bridge     [Wizard's study Summoning circle]  wall walk~
 *   46  Sally port~ = Portcullis   = Barracks yard = Great hall     = [Chapel nave   Chapel altar] = E breach~  (the wing)
 *   47  wall walk    [Archery green   Training ring]  Crossroads       [Queen's garden  Conservatory]  wall walk
 *   48  wall walk    [Kennel yard     Sparring pit ]  (Courtyard)      [Herb garden     Orchard     ]  wall walk
 *   49  SW tower      Storerooms      W guardhouse    (Gate)           E guardhouse    Ice house       SE tower
 *
 *   `=` a door between segments on that row; `~` the winding wall walks used by the wall-walk missions.
 *   Quarters: royal chambers (upper left, one 2x2 of rooms joined by 2-wide doors), wizard's tower
 *   (upper right, one 2x2 space round the great summoning circle, with ley lines running in from
 *   each room's centrepiece), training ring (lower left, one open outdoor 2x2: archery targets,
 *   practice dummies on a track, kennels and a sparring pit), garden (lower right, one outdoor 2x2
 *   space round a pond).
 *   Rows 47-48 (cols 59-63) are outdoors: grass, water and walking paths with little rock. The
 *   crossroads (61_47) is an outdoor four-way crossing among trees. Row 46 is the transition
 *   indoors: the barracks (60_46, two bunkhouses and a drill square) and the chapel (62-63_46,
 *   in one churchyard) are outbuildings in yards, and the great hall (61_46) is the keep door.
 *   * the royal treasury is reached only by a 1-wide secret door behind the throne.
 *
 * Ways in: the 61_49 gate (south), the west sally port (58_46, bridge over the moat) and the east
 * breach (64_46, shallow ford). The courtyard (61_48) is the hub: north to the crossroads, and
 * 4-wide doors west to the training ring and east to the garden. The training ring is reached only
 * through the courtyard's west door (it also opens south to the west guardhouse and storerooms,
 * which have no other way in). The crossroads leads north to the great hall, east into the garden,
 * and west into a walled lane along 60_47's north edge that ends at the barracks' south door. The
 * garden opens only to the courtyard, the crossroads and the east guardhouse / ice house (quest
 * doors, which have no other way in), not the wall walk or the chapel. The wing (row 46): the great
 * hall leads north onto the chasm bridge (61_45), the throne room's only way in, west into the
 * barracks yard (then the portcullis hall and the sally port) and east into the chapel yard, whose
 * path runs round the chapel to the east breach.
 * The outer ring (wall walks, north wall walks and corner towers) opens inward only at the sally
 * port (into the portcullis hall), the breach (into the chapel yard) and one 2-wide door each into
 * the royal chambers (58_44 guard room -> master bedroom) and the wizard's tower (64_44 guard room ->
 * alchemy lab); the north stair tower's stair down is walled up, and the corner towers do not open
 * onto the quest rooms. The west (58_46 -> 58_45 -> 58_44) and east (64_46 -> 64_45 -> 64_44) wall
 * walks wind: from the sally port / breach passage a 2-wide stair climbs the inner side, the
 * murder-hole gallery (58_45 / 64_45) doubles back through three side-by-side 2-wide galleries, and
 * the walk comes up the curtain side into the guard room with the door. The two halves of the ring
 * do not meet in the north (the treasury sits between them).
 *
 * Floors: Dirt marks the main routes through each room (door to door); Gravel marks the floor off them.
 * Outdoors (rows 47-48) the floor is Grass with Dirt paths. In the garden and the wizard's tower, a
 * Dirt loop round the centrepiece joins every door.
 * Stone: walls, pillars and furniture are Brick (laid stone; only units with Brick access can break,
 * shape or draw on it). About 13% of the stone is natural Rock, spread through every quarter, so
 * Earth Core always has something to work with: collapsed or slumped stretches of the curtain and
 * the towers' moat-side faces, rubble heaps (Rock in Gravel) on the wall walks and north walks, the
 * breach's broken wall, the chasm walls of 61_45, the bath's bedrock columns, the summoning circle's
 * standing stones, the ice blocks, the churchyard's fieldstone south wall, the yew and headstones,
 * and the outdoor trees, posts and targets of the south band (the kennel huts are Brick). The
 * outcrop south of the moat (into 59_50 / 60_50) stays Rock. `castle.test.ts` keeps Brick at 70% or
 * more of the stone and some Rock in every quarter.
 * Network: one `{col}_{row}_center` node per segment, with an edge for every door between segments
 * (and between the four rooms of each 2x2); 61_47 links to the courtyard's `61_48_keep_door`, and
 * 60_48 / 62_48 to its `61_48_west_door` / `61_48_east_door`. The barracks lane has its own
 * `60_47_lane` node (crossroads <-> barracks), apart from the ring's `60_47_center`. In the chapel
 * yard the `62_46_center` / `63_46_center` nodes sit on the churchyard path's bends, and
 * `62_46_nave` / `63_46_crossing` mark the way through the chapel. The murder-hole galleries have
 * `58_45_turn_north` / `_turn_south` (and `64_45_…`) nodes on their bends.
 * Light spots: only the two dark-crystal braziers in the throne room.
 *
 * The segments were painted on one castle-wide canvas and sliced, so neighbouring edges always
 * match; `castle.test.ts` checks seams, reachability, the ring's openings, the wall-walk routes,
 * the Brick share and POI/node placement.
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
import { SEGMENT_59_44_MASTER_BEDROOM } from './59_44_master_bedroom';
import { SEGMENT_60_44_ROYAL_SOLAR } from './60_44_royal_solar';
import { SEGMENT_61_44_THRONE_ROOM } from './61_44_throne_room';
import { SEGMENT_62_44_GREAT_LIBRARY } from './62_44_great_library';
import { SEGMENT_63_44_ALCHEMY_LAB } from './63_44_alchemy_lab';
import { SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM } from './64_44_east_wall_walk_guardroom';
import { SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES } from './58_45_west_wall_walk_murder_holes';
import { SEGMENT_59_45_ROYAL_BATHS } from './59_45_royal_baths';
import { SEGMENT_60_45_PRIVY_CHAMBER } from './60_45_privy_chamber';
import { SEGMENT_61_45_CHASM_BRIDGE } from './61_45_chasm_bridge';
import { SEGMENT_62_45_WIZARDS_STUDY } from './62_45_wizards_study';
import { SEGMENT_63_45_SUMMONING_CIRCLE } from './63_45_summoning_circle';
import { SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES } from './64_45_east_wall_walk_murder_holes';
import { SEGMENT_58_46_WEST_SALLY_PORT } from './58_46_west_sally_port';
import { SEGMENT_59_46_PORTCULLIS_HALL } from './59_46_portcullis_hall';
import { SEGMENT_60_46_BARRACKS } from './60_46_barracks';
import { SEGMENT_61_46_GREAT_HALL } from './61_46_great_hall';
import { SEGMENT_62_46_CHAPEL_NAVE } from './62_46_chapel_nave';
import { SEGMENT_63_46_CHAPEL_ALTAR } from './63_46_chapel_altar';
import { SEGMENT_64_46_EAST_BREACH } from './64_46_east_breach';
import { SEGMENT_58_47_WEST_WALL_WALK_LATRINE } from './58_47_west_wall_walk_latrine';
import { SEGMENT_59_47_ARCHERY_GREEN } from './59_47_archery_green';
import { SEGMENT_60_47_TRAINING_RING } from './60_47_training_ring';
import { SEGMENT_61_47_CROSSROADS } from './61_47_crossroads';
import { SEGMENT_62_47_QUEENS_GARDEN } from './62_47_queens_garden';
import { SEGMENT_63_47_CONSERVATORY } from './63_47_conservatory';
import { SEGMENT_64_47_EAST_WALL_WALK_LATRINE } from './64_47_east_wall_walk_latrine';
import { SEGMENT_58_48_WEST_WALL_WALK_WELL } from './58_48_west_wall_walk_well';
import { SEGMENT_59_48_KENNEL_YARD } from './59_48_kennel_yard';
import { SEGMENT_60_48_SPARRING_PIT } from './60_48_sparring_pit';
import { SEGMENT_62_48_HERB_GARDEN } from './62_48_herb_garden';
import { SEGMENT_63_48_ORCHARD } from './63_48_orchard';
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
    SEGMENT_59_44_MASTER_BEDROOM,
    SEGMENT_60_44_ROYAL_SOLAR,
    SEGMENT_61_44_THRONE_ROOM,
    SEGMENT_62_44_GREAT_LIBRARY,
    SEGMENT_63_44_ALCHEMY_LAB,
    SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM,
    SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES,
    SEGMENT_59_45_ROYAL_BATHS,
    SEGMENT_60_45_PRIVY_CHAMBER,
    SEGMENT_61_45_CHASM_BRIDGE,
    SEGMENT_62_45_WIZARDS_STUDY,
    SEGMENT_63_45_SUMMONING_CIRCLE,
    SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES,
    SEGMENT_58_46_WEST_SALLY_PORT,
    SEGMENT_59_46_PORTCULLIS_HALL,
    SEGMENT_60_46_BARRACKS,
    SEGMENT_61_46_GREAT_HALL,
    SEGMENT_62_46_CHAPEL_NAVE,
    SEGMENT_63_46_CHAPEL_ALTAR,
    SEGMENT_64_46_EAST_BREACH,
    SEGMENT_58_47_WEST_WALL_WALK_LATRINE,
    SEGMENT_59_47_ARCHERY_GREEN,
    SEGMENT_60_47_TRAINING_RING,
    SEGMENT_61_47_CROSSROADS,
    SEGMENT_62_47_QUEENS_GARDEN,
    SEGMENT_63_47_CONSERVATORY,
    SEGMENT_64_47_EAST_WALL_WALK_LATRINE,
    SEGMENT_58_48_WEST_WALL_WALK_WELL,
    SEGMENT_59_48_KENNEL_YARD,
    SEGMENT_60_48_SPARRING_PIT,
    SEGMENT_62_48_HERB_GARDEN,
    SEGMENT_63_48_ORCHARD,
    SEGMENT_64_48_EAST_WALL_WALK_WELL,
    SEGMENT_58_49_SOUTHWEST_TOWER,
    SEGMENT_59_49_STOREROOMS,
    SEGMENT_60_49_WEST_GUARDHOUSE,
    SEGMENT_62_49_EAST_GUARDHOUSE,
    SEGMENT_63_49_ICE_HOUSE,
    SEGMENT_64_49_SOUTHEAST_TOWER,
];
