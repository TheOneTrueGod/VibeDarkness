/**
 * The castle around the 61_49 gate: segments 57-65 x 40-49 (9 wide, 10 tall), built around the
 * existing 61_49 Castle Gate and 61_48 Castle Courtyard. Each segment is 22x22; one file per segment.
 *
 * Plan (north at top). A walkway runs north up col 61; two wings cross the castle on rows 46 and 43.
 * The west side is martial and service rooms, the east side sacred and arcane rooms. A moat and a
 * 3-thick curtain wall ring the whole castle, with a wall walk inside it and towers at the corners.
 *
 *          57          58            59             60            61              62             63              64             65
 *   40  NW tower    N wall walk   N stair tower   Treasury     Royal vault*    Portrait gallery Observatory     N wall walk     NE tower
 *   41  wall walk   Watch hall    Royal guard     War room     THRONE ROOM     Royal bedchamber Royal baths     Queen's garden  wall walk
 *   42  wall walk   Dungeon block Oubliette       Officers     Chasm bridge    Wizard's study   Menagerie       Conservatory    wall walk
 *   43  W bastion = Interrogation=Arena gate    = Hall of arms= ROTUNDA      = Hall of mirrors= Arcane conduit= Summoning     = E bastion   (upper wing)
 *   44  wall walk   Prison cells  Gladiator pit   Armoury      Statue gallery  Great library    Library rotunda Forbidden arch. wall walk
 *   45  wall walk   Kennels       Archery range   Training yd  Great hall      Scriptorium      Flooded crypt   Ossuary         wall walk
 *   46  Sally port= W bailey     = Portcullis    = Barracks   = HALL OF BANNERS= Chapel nave   = Chapel altar  = Bell tower    = E breach    (lower wing)
 *   47  wall walk   Wine cellar   Servants' qtrs  Kitchens     Grand foyer     Infirmary        Alchemy lab     Cloister        wall walk
 *   48  wall walk   Granary       Smithy          Stables      (Courtyard)     Herb garden      Orchard         Cistern         wall walk
 *   49  SW tower    Woodshed      Storerooms      W guardhouse (Gate)          E guardhouse     Chaplain cells  Ice house       SE tower
 *
 *   * the royal vault is reached only by a 1-wide secret door behind the throne.
 *
 * Ways in: the 61_49 gate (south), the west sally port (57_46, bridge over the moat) and the east
 * breach (65_46, shallow ford). The courtyard (61_48) is walled off from its neighbours, so the side
 * blocks are reached from the wings, the foyer's servant doors or the wall walks.
 *
 * Network: one `{col}_{row}_center` node per segment, with an edge for every door between segments;
 * 61_47 links to the courtyard's `61_48_keep_door`.
 * Light spots: only the two dark-crystal braziers in the throne room.
 *
 * The segments were painted on one castle-wide canvas and sliced, so neighbouring edges always
 * match; `castle.test.ts` checks seams, reachability and POI/node placement.
 */

import type { CastleSegment } from './castleSegment';
import { SEGMENT_57_40_NORTHWEST_TOWER } from './57_40_northwest_tower';
import { SEGMENT_58_40_NORTH_WALL_WALK_WEST } from './58_40_north_wall_walk_west';
import { SEGMENT_59_40_NORTH_STAIR_TOWER } from './59_40_north_stair_tower';
import { SEGMENT_60_40_TREASURY } from './60_40_treasury';
import { SEGMENT_61_40_ROYAL_VAULT } from './61_40_royal_vault';
import { SEGMENT_62_40_PORTRAIT_GALLERY } from './62_40_portrait_gallery';
import { SEGMENT_63_40_OBSERVATORY } from './63_40_observatory';
import { SEGMENT_64_40_NORTH_WALL_WALK_EAST } from './64_40_north_wall_walk_east';
import { SEGMENT_65_40_NORTHEAST_TOWER } from './65_40_northeast_tower';
import { SEGMENT_57_41_WEST_WALL_WALK_GUARDROOM } from './57_41_west_wall_walk_guardroom';
import { SEGMENT_58_41_WATCH_HALL } from './58_41_watch_hall';
import { SEGMENT_59_41_ROYAL_GUARD_HALL } from './59_41_royal_guard_hall';
import { SEGMENT_60_41_WAR_ROOM } from './60_41_war_room';
import { SEGMENT_61_41_THRONE_ROOM } from './61_41_throne_room';
import { SEGMENT_62_41_ROYAL_BEDCHAMBER } from './62_41_royal_bedchamber';
import { SEGMENT_63_41_ROYAL_BATHS } from './63_41_royal_baths';
import { SEGMENT_64_41_QUEENS_GARDEN } from './64_41_queens_garden';
import { SEGMENT_65_41_EAST_WALL_WALK_GUARDROOM } from './65_41_east_wall_walk_guardroom';
import { SEGMENT_57_42_WEST_WALL_WALK_ARMOURY } from './57_42_west_wall_walk_armoury';
import { SEGMENT_58_42_DUNGEON_BLOCK } from './58_42_dungeon_block';
import { SEGMENT_59_42_OUBLIETTE } from './59_42_oubliette';
import { SEGMENT_60_42_OFFICERS_QUARTERS } from './60_42_officers_quarters';
import { SEGMENT_61_42_CHASM_BRIDGE } from './61_42_chasm_bridge';
import { SEGMENT_62_42_WIZARDS_STUDY } from './62_42_wizards_study';
import { SEGMENT_63_42_MENAGERIE } from './63_42_menagerie';
import { SEGMENT_64_42_CONSERVATORY } from './64_42_conservatory';
import { SEGMENT_65_42_EAST_WALL_WALK_ARMOURY } from './65_42_east_wall_walk_armoury';
import { SEGMENT_57_43_WEST_BASTION } from './57_43_west_bastion';
import { SEGMENT_58_43_INTERROGATION_HALL } from './58_43_interrogation_hall';
import { SEGMENT_59_43_ARENA_GATE } from './59_43_arena_gate';
import { SEGMENT_60_43_HALL_OF_ARMS } from './60_43_hall_of_arms';
import { SEGMENT_61_43_ROTUNDA } from './61_43_rotunda';
import { SEGMENT_62_43_HALL_OF_MIRRORS } from './62_43_hall_of_mirrors';
import { SEGMENT_63_43_ARCANE_CONDUIT } from './63_43_arcane_conduit';
import { SEGMENT_64_43_SUMMONING_CIRCLE } from './64_43_summoning_circle';
import { SEGMENT_65_43_EAST_BASTION } from './65_43_east_bastion';
import { SEGMENT_57_44_WEST_WALL_WALK_MURDER_HOLES } from './57_44_west_wall_walk_murder_holes';
import { SEGMENT_58_44_PRISON_CELLS } from './58_44_prison_cells';
import { SEGMENT_59_44_GLADIATOR_PIT } from './59_44_gladiator_pit';
import { SEGMENT_60_44_ARMOURY } from './60_44_armoury';
import { SEGMENT_61_44_STATUE_GALLERY } from './61_44_statue_gallery';
import { SEGMENT_62_44_GREAT_LIBRARY } from './62_44_great_library';
import { SEGMENT_63_44_LIBRARY_ROTUNDA } from './63_44_library_rotunda';
import { SEGMENT_64_44_FORBIDDEN_ARCHIVE } from './64_44_forbidden_archive';
import { SEGMENT_65_44_EAST_WALL_WALK_MURDER_HOLES } from './65_44_east_wall_walk_murder_holes';
import { SEGMENT_57_45_WEST_WALL_WALK_LATRINE } from './57_45_west_wall_walk_latrine';
import { SEGMENT_58_45_KENNELS } from './58_45_kennels';
import { SEGMENT_59_45_ARCHERY_RANGE } from './59_45_archery_range';
import { SEGMENT_60_45_TRAINING_YARD } from './60_45_training_yard';
import { SEGMENT_61_45_GREAT_HALL } from './61_45_great_hall';
import { SEGMENT_62_45_SCRIPTORIUM } from './62_45_scriptorium';
import { SEGMENT_63_45_FLOODED_CRYPT } from './63_45_flooded_crypt';
import { SEGMENT_64_45_OSSUARY } from './64_45_ossuary';
import { SEGMENT_65_45_EAST_WALL_WALK_LATRINE } from './65_45_east_wall_walk_latrine';
import { SEGMENT_57_46_WEST_SALLY_PORT } from './57_46_west_sally_port';
import { SEGMENT_58_46_WEST_BAILEY } from './58_46_west_bailey';
import { SEGMENT_59_46_PORTCULLIS_HALL } from './59_46_portcullis_hall';
import { SEGMENT_60_46_BARRACKS } from './60_46_barracks';
import { SEGMENT_61_46_HALL_OF_BANNERS } from './61_46_hall_of_banners';
import { SEGMENT_62_46_CHAPEL_NAVE } from './62_46_chapel_nave';
import { SEGMENT_63_46_CHAPEL_ALTAR } from './63_46_chapel_altar';
import { SEGMENT_64_46_BELL_TOWER } from './64_46_bell_tower';
import { SEGMENT_65_46_EAST_BREACH } from './65_46_east_breach';
import { SEGMENT_57_47_WEST_WALL_WALK_CELLAR_DOOR } from './57_47_west_wall_walk_cellar_door';
import { SEGMENT_58_47_WINE_CELLAR } from './58_47_wine_cellar';
import { SEGMENT_59_47_SERVANTS_QUARTERS } from './59_47_servants_quarters';
import { SEGMENT_60_47_KITCHENS } from './60_47_kitchens';
import { SEGMENT_61_47_GRAND_FOYER } from './61_47_grand_foyer';
import { SEGMENT_62_47_INFIRMARY } from './62_47_infirmary';
import { SEGMENT_63_47_ALCHEMY_LAB } from './63_47_alchemy_lab';
import { SEGMENT_64_47_CLOISTER } from './64_47_cloister';
import { SEGMENT_65_47_EAST_WALL_WALK_CLOISTER_DOOR } from './65_47_east_wall_walk_cloister_door';
import { SEGMENT_57_48_WEST_WALL_WALK_WELL } from './57_48_west_wall_walk_well';
import { SEGMENT_58_48_GRANARY } from './58_48_granary';
import { SEGMENT_59_48_SMITHY } from './59_48_smithy';
import { SEGMENT_60_48_STABLES } from './60_48_stables';
import { SEGMENT_62_48_HERB_GARDEN } from './62_48_herb_garden';
import { SEGMENT_63_48_ORCHARD } from './63_48_orchard';
import { SEGMENT_64_48_CISTERN } from './64_48_cistern';
import { SEGMENT_65_48_EAST_WALL_WALK_WELL } from './65_48_east_wall_walk_well';
import { SEGMENT_57_49_SOUTHWEST_TOWER } from './57_49_southwest_tower';
import { SEGMENT_58_49_WOODSHED } from './58_49_woodshed';
import { SEGMENT_59_49_STOREROOMS } from './59_49_storerooms';
import { SEGMENT_60_49_WEST_GUARDHOUSE } from './60_49_west_guardhouse';
import { SEGMENT_62_49_EAST_GUARDHOUSE } from './62_49_east_guardhouse';
import { SEGMENT_63_49_CHAPLAINS_CELLS } from './63_49_chaplains_cells';
import { SEGMENT_64_49_ICE_HOUSE } from './64_49_ice_house';
import { SEGMENT_65_49_SOUTHEAST_TOWER } from './65_49_southeast_tower';

/** Every castle segment except the existing 61_49 gate and 61_48 courtyard, north to south. */
export const CASTLE_SEGMENTS: CastleSegment[] = [
    SEGMENT_57_40_NORTHWEST_TOWER,
    SEGMENT_58_40_NORTH_WALL_WALK_WEST,
    SEGMENT_59_40_NORTH_STAIR_TOWER,
    SEGMENT_60_40_TREASURY,
    SEGMENT_61_40_ROYAL_VAULT,
    SEGMENT_62_40_PORTRAIT_GALLERY,
    SEGMENT_63_40_OBSERVATORY,
    SEGMENT_64_40_NORTH_WALL_WALK_EAST,
    SEGMENT_65_40_NORTHEAST_TOWER,
    SEGMENT_57_41_WEST_WALL_WALK_GUARDROOM,
    SEGMENT_58_41_WATCH_HALL,
    SEGMENT_59_41_ROYAL_GUARD_HALL,
    SEGMENT_60_41_WAR_ROOM,
    SEGMENT_61_41_THRONE_ROOM,
    SEGMENT_62_41_ROYAL_BEDCHAMBER,
    SEGMENT_63_41_ROYAL_BATHS,
    SEGMENT_64_41_QUEENS_GARDEN,
    SEGMENT_65_41_EAST_WALL_WALK_GUARDROOM,
    SEGMENT_57_42_WEST_WALL_WALK_ARMOURY,
    SEGMENT_58_42_DUNGEON_BLOCK,
    SEGMENT_59_42_OUBLIETTE,
    SEGMENT_60_42_OFFICERS_QUARTERS,
    SEGMENT_61_42_CHASM_BRIDGE,
    SEGMENT_62_42_WIZARDS_STUDY,
    SEGMENT_63_42_MENAGERIE,
    SEGMENT_64_42_CONSERVATORY,
    SEGMENT_65_42_EAST_WALL_WALK_ARMOURY,
    SEGMENT_57_43_WEST_BASTION,
    SEGMENT_58_43_INTERROGATION_HALL,
    SEGMENT_59_43_ARENA_GATE,
    SEGMENT_60_43_HALL_OF_ARMS,
    SEGMENT_61_43_ROTUNDA,
    SEGMENT_62_43_HALL_OF_MIRRORS,
    SEGMENT_63_43_ARCANE_CONDUIT,
    SEGMENT_64_43_SUMMONING_CIRCLE,
    SEGMENT_65_43_EAST_BASTION,
    SEGMENT_57_44_WEST_WALL_WALK_MURDER_HOLES,
    SEGMENT_58_44_PRISON_CELLS,
    SEGMENT_59_44_GLADIATOR_PIT,
    SEGMENT_60_44_ARMOURY,
    SEGMENT_61_44_STATUE_GALLERY,
    SEGMENT_62_44_GREAT_LIBRARY,
    SEGMENT_63_44_LIBRARY_ROTUNDA,
    SEGMENT_64_44_FORBIDDEN_ARCHIVE,
    SEGMENT_65_44_EAST_WALL_WALK_MURDER_HOLES,
    SEGMENT_57_45_WEST_WALL_WALK_LATRINE,
    SEGMENT_58_45_KENNELS,
    SEGMENT_59_45_ARCHERY_RANGE,
    SEGMENT_60_45_TRAINING_YARD,
    SEGMENT_61_45_GREAT_HALL,
    SEGMENT_62_45_SCRIPTORIUM,
    SEGMENT_63_45_FLOODED_CRYPT,
    SEGMENT_64_45_OSSUARY,
    SEGMENT_65_45_EAST_WALL_WALK_LATRINE,
    SEGMENT_57_46_WEST_SALLY_PORT,
    SEGMENT_58_46_WEST_BAILEY,
    SEGMENT_59_46_PORTCULLIS_HALL,
    SEGMENT_60_46_BARRACKS,
    SEGMENT_61_46_HALL_OF_BANNERS,
    SEGMENT_62_46_CHAPEL_NAVE,
    SEGMENT_63_46_CHAPEL_ALTAR,
    SEGMENT_64_46_BELL_TOWER,
    SEGMENT_65_46_EAST_BREACH,
    SEGMENT_57_47_WEST_WALL_WALK_CELLAR_DOOR,
    SEGMENT_58_47_WINE_CELLAR,
    SEGMENT_59_47_SERVANTS_QUARTERS,
    SEGMENT_60_47_KITCHENS,
    SEGMENT_61_47_GRAND_FOYER,
    SEGMENT_62_47_INFIRMARY,
    SEGMENT_63_47_ALCHEMY_LAB,
    SEGMENT_64_47_CLOISTER,
    SEGMENT_65_47_EAST_WALL_WALK_CLOISTER_DOOR,
    SEGMENT_57_48_WEST_WALL_WALK_WELL,
    SEGMENT_58_48_GRANARY,
    SEGMENT_59_48_SMITHY,
    SEGMENT_60_48_STABLES,
    SEGMENT_62_48_HERB_GARDEN,
    SEGMENT_63_48_ORCHARD,
    SEGMENT_64_48_CISTERN,
    SEGMENT_65_48_EAST_WALL_WALK_WELL,
    SEGMENT_57_49_SOUTHWEST_TOWER,
    SEGMENT_58_49_WOODSHED,
    SEGMENT_59_49_STOREROOMS,
    SEGMENT_60_49_WEST_GUARDHOUSE,
    SEGMENT_62_49_EAST_GUARDHOUSE,
    SEGMENT_63_49_CHAPLAINS_CELLS,
    SEGMENT_64_49_ICE_HOUSE,
    SEGMENT_65_49_SOUTHEAST_TOWER,
];
