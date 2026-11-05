/**
 * Storm Core tuning shared by the whole tree (cards, the Static resource and research nodes).
 * Single source of truth: cards and `resources/Static.ts` read from here. See `StormCore.md`.
 */
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { getThemeById } from '../../themes/abilityTheme';

const STORM = formatGroupId(AbilityGroupId.Storm);

export const ARC_BOLT_ABILITY_ID = `${STORM}01`;
export const STATIC_STEP_ABILITY_ID = `${STORM}02`;
export const CHAIN_LIGHTNING_ABILITY_ID = `${STORM}03`;
export const THUNDERCLAP_ABILITY_ID = `${STORM}04`;

// ---------------------------------------------------------------------------
// Colours (by theme role; see themes/AGENTS.md)
// ---------------------------------------------------------------------------

const STORM_THEME = getThemeById('storm');
/** Storm-cloud blue: fills, bodies, telegraph mass. */
export const STORM_PRIMARY = STORM_THEME.primaryNum;
/** Electric cyan: bolts, sparks, trails, Static. */
export const STORM_SECONDARY = STORM_THEME.secondaryNum;
/** Dark detail (shadow under bolts, card outlines). */
export const STORM_SHADE = STORM_THEME.shadeNum;
/** The white-hot core every bolt is drawn with. */
export const STORM_CORE_WHITE = 0xffffff;

// Static (resource) and Conductive (mark) live with their engine definitions; re-exported for the cards.
export {
    STATIC_GROUND_SECONDS,
    STATIC_MAX,
    STATIC_MAX_STEP_PX,
    STATIC_MISSION_START,
    STATIC_PX_PER_POINT,
} from '../../resources/Static';
export {
    CONDUCTIVE_DURATION_SECONDS,
    CONDUCTIVE_MARK_ID,
    CONDUCTIVE_MAX_STACKS,
} from '../../buffs/marks/conductiveMark';

// ---------------------------------------------------------------------------
// 1301 Arc Bolt
// ---------------------------------------------------------------------------

export const ARC_BOLT_DAMAGE = 6;
export const ARC_BOLT_MAX_USES = 3;
export const ARC_BOLT_CONDUCTIVE_STACKS = 1;
/** Bolts are fast: half again as quick as a thrown rock. */
export const ARC_BOLT_SPEED_MULT = 1.5;
export const ARC_BOLT_RADIUS = 5;
/** Max reach (px) of one leap down the Conductive ladder. */
export const ARC_BOLT_BOUNCE_RANGE = 130;
/** Extra damage a leap deals on top of the bolt's damage. */
export const ARC_BOLT_BOUNCE_BONUS_DAMAGE = 4;
/** Safety cap on leaps per bolt (Conductive's max stacks is the real limit: one leap per rung). */
export const ARC_BOLT_MAX_BOUNCES = 8;
/** Visual: seconds between successive bounces appearing. */
export const ARC_BOLT_BOUNCE_DELAY = 0.05;

// ---------------------------------------------------------------------------
// 1302 Static Step
// ---------------------------------------------------------------------------

export const STATIC_STEP_DISTANCE = 150;
export const STATIC_STEP_DURATION = 0.25;
export const STATIC_STEP_RECOVERY = 0.2;
export const STATIC_STEP_DAMAGE = 3;
export const STATIC_STEP_CONDUCTIVE_STACKS = 1;
export const STATIC_STEP_MAX_USES = 2;
export const STATIC_STEP_COLLISION_STEP = 4;
export const STATIC_STEP_STATIC_COST = 1;

// ---------------------------------------------------------------------------
// 1303 Chain Lightning
// ---------------------------------------------------------------------------

export const CHAIN_LIGHTNING_STATIC_COST = 2;
export const CHAIN_LIGHTNING_MAX_USES = 2;
export const CHAIN_LIGHTNING_RANGE = 220;
export const CHAIN_LIGHTNING_WINDUP = 0.35;
export const CHAIN_LIGHTNING_COOLDOWN = 0.9;
/** Extra enemies the bolt leaps to after the first (Forked Lightning adds more). */
export const CHAIN_LIGHTNING_JUMPS = 6;
/** Max distance (px, centre to centre) of one leap between enemies or conductors. */
export const CHAIN_LIGHTNING_JUMP_RANGE = 130;
export const CHAIN_LIGHTNING_DAMAGE = 7;
/** Bonus damage per Conductive stack the bolt consumes. */
export const CHAIN_LIGHTNING_DAMAGE_PER_CONDUCTIVE = 4;
/** Stagger applied to an enemy the bolt drained Conductive from. */
export const CHAIN_LIGHTNING_STAGGER_SECONDS = 0.5;
/** Visual: seconds between successive leaps appearing. */
export const CHAIN_LIGHTNING_HOP_DELAY = 0.06;
/** Conductors a single bolt may pass through (each is a free leap that does not count as a jump). */
export const CHAIN_LIGHTNING_MAX_CONDUCTOR_RELAYS = 3;
/** Forked Lightning (research): extra jumps. */
export const FORKED_LIGHTNING_EXTRA_JUMPS = 2;

// ---------------------------------------------------------------------------
// 1304 Thunderclap
// ---------------------------------------------------------------------------

export const THUNDERCLAP_STATIC_COST = 2;
export const THUNDERCLAP_WINDUP = 0.45;
export const THUNDERCLAP_COOLDOWN = 0.8;
export const THUNDERCLAP_RADIUS = 95;
export const THUNDERCLAP_DAMAGE = 6;
/** Damage to an enemy the clap spent a Conductive stack from. */
export const THUNDERCLAP_CHARGED_DAMAGE = 10;
/** Conductive stacks spent from each enemy struck. */
export const THUNDERCLAP_CONDUCTIVE_SPENT_PER_ENEMY = 1;
/** Static returned to the caster per Conductive stack spent. */
export const THUNDERCLAP_STATIC_PER_CHARGE = 1;
export const THUNDERCLAP_KNOCKBACK_TIER = 1;
export const THUNDERCLAP_MAX_TARGETS = 8;
/** Bright magnitude by Conductive stacks spent: Bright 1 for none, 2 from this many, 3 from the next. */
export const THUNDERCLAP_BRIGHT_2_CHARGES = 2;
export const THUNDERCLAP_BRIGHT_3_CHARGES = 4;
