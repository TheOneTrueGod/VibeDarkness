/**
 * Unit definitions own how units are drawn.
 * GameRenderer calls renderUnit(unit, context); the appropriate UnitDef creates the visual.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import { createBadge, updateBadgeText } from '../../GameRenderer/PixiComponents';
import type { Unit } from '../Unit';
import type { TeamId } from '../../teams';
import { areEnemies } from '../../teams';
import {
    darkCreatureParticleBurstVFX,
    darkCreatureIconFlashVFX,
} from '../../deathEffects/darkCreatureDissolutionDef';
import type { VisualEffectDef } from '../../effects/visualEffectDef';
import type { DeathSequenceDef } from '../../deathSequences/deathSequenceDef';
import { ALPHA_WOLF_DEATH_SEQUENCE, DISPLACER_SPIRIT_DEATH_SEQUENCE } from '../../deathSequences/deathSequencePresets';
import { DARK_CREATURE_CORRUPTION_TINT, DARK_CREATURE_ICON_TINT_ALPHA } from '../../deathEffects/darkCreatureVisualConstants';
import { getPortrait } from '../../../character_defs/portraitLoader';
import { DEFAULT_UNIT_SIZE, UNIT_SIZE_MAP, type UnitSize } from './unitConstants';
import type { CcResistKey } from '../../../crowdControl/ccTypes';
import { UnitTag, hidesWorldHpBar } from '../unitTag';
import { enragePreset, type UnitPhaseDef } from '../components/phaseDef';
import { PHASE_COMPONENT } from '../components/phaseComponent';
import type { LightHateDef } from '../../lightHate';
import { DarknessLevel } from '../../darknessLevels';
import type { EnemySpawnDef } from '../../../storylines/types';
import { UNIT_SPRITE_URLS } from './unitSprites';
import { componentSpec, type UnitComponentSpec } from '../components/unitComponent';
import { LANTERNITE_COMPONENT } from '../components/lanterniteComponent';
import { SWARM_COMPONENT } from '../components/swarmComponent';
import { SLIME } from '../dark_animals/slime';
import {
    ENEMY_DARK_WOLF,
    ENEMY_ALPHA_WOLF,
    ALPHA_WOLF_ENRAGE_THRESHOLD,
    ENEMY_BOAR,
    ENEMY_THORNBINDER,
    ENEMY_SWARMLING,
    ALLY_LANTERNITE,
} from '../../../constants/enemyConstants';

/**
 * Defines the spawn animation played when a unit of this type enters the field via darknessSpawn.
 * Duration drives spawnTimer; all other animation parameters live here, not on Unit.
 */
export type SpawnAnimationDef =
    | { type: 'darkVortex'; duration: number }
    | { type: 'burstRise'; duration: number; riseHeight?: number };

type HpBarSize = 'large' | 'small' | 'hidden';

function getHpBarSize(unit: Unit): HpBarSize {
    if (hidesWorldHpBar(unit)) return 'hidden';
    if (unit.teamId === 'player') return 'large';
    return 'small';
}

/** Optional crowd-control tuning merged onto units at spawn (see `applyCombatCrowdControlProfile`). */
export type UnitCombatCcDef = {
    ccDurationResistPct?: Partial<Record<CcResistKey, number>>;
    ccDurationFlatSec?: Partial<Record<CcResistKey, number>>;
    hardCcArmourFloor?: number;
    chainCcResist?: number;
    chainCcDecayRounds?: number;
    /** Fixed stun duration (seconds) applied when CC armour breaks. Overrides the incoming hit's duration. */
    ccArmourBreakStunDuration?: number;
    /** Subtracts from the incoming knockback tier before CC armour is checked. Default 0. */
    knockbackResistance?: number;
};

/** Color for non-player allied units (pets, summoned NPCs). */
const ALLY_PET_GLOW_COLOR = 0x3b82f6; // blue-500
/** Color for allied player-controlled units. */
const ALLY_PLAYER_GLOW_COLOR = 0x9ca3af; // gray-400
/** Color for enemy unit glows. */
const ENEMY_GLOW_COLOR = 0xef4444; // red-500
/** Color for nature-faction unit glows. */
const NATURE_GLOW_COLOR = 0x22c55e; // green-500
/** Glow radius around units. */
const GLOW_RADIUS = 6;
/** Scale of character sprite relative to hitbox diameter (1 = same size). */
export const CHARACTER_SPRITE_SCALE = 0.85;

/** Context passed to unit def when creating a visual. */
export interface IUnitRenderContext {
    /** Team ID used to determine friend/foe glow colors. */
    localTeamId: TeamId;
    /** Get a cached character texture by character ID (e.g. 'slime' for the slime unit). */
    getCharacterTexture(characterId: string): Texture | null;
    /** Preloaded portrait texture for player units (portrait ID from campaign). */
    getPlayerPortraitTexture(portraitId: string): Texture | null;
}

/** Unit definition: responsible for drawing one unit type. */
export interface IUnitDef {
    /** Create the Pixi container for this unit (glow, body, label, HP bar placeholders). */
    createVisual(unit: Unit, context: IUnitRenderContext): Container;
}

/** Single runtime ID for all player-controlled battle units. */
export type PlayerUnitDefId = 'player';

/** Enemy unit character IDs. */
export type EnemyUnitId =
    | 'slime'
    | 'dark_wolf'
    | 'alpha_wolf'
    | 'boar'
    | 'thornbinder'
    | 'swarmling'
    | 'displacer_spirit'
    | 'displacer_clone'
    | 'lanternite'
    | 'lanternite_nest'
    | 'swarm_nest'
    | 'dog';
export type UnitDefId = PlayerUnitDefId | EnemyUnitId;

/**
 * Narrative / VFX hint for enemy categorization (see writing-style-enemies skill).
 * Set on every enemy unit def when the category is clear; if ambiguous, prompt the user before locking copy or visuals.
 */
export type CreatureType = 'dark_creature' | 'beast' | 'nature';

/** Serialized on units; all players share baseline stats from UNIT_DEFS.player. */
export const PLAYER_CHARACTER_ID: PlayerUnitDefId = 'player';

/**
 * Per-character static definition. Properties here are universal for all units of that characterId.
 * Add a property here (not on Unit) when its value is the same for every spawn of a given character type.
 * Expose it via a typed accessor function and a getter on Unit (see `knockbackResistance` for the pattern).
 */
export interface UnitDefEntry {
    bodyColor: number;
    /** Name shown in the Bestiary and other UI. Required for every enemy (see unitDefRegistry.test). */
    displayName?: string;
    /** Art URL for icons (Bestiary, timeline). Required for every enemy. Values come from `UNIT_SPRITE_URLS`. */
    sprite?: string;
    /**
     * Bestiary listing. Every enemy needs one unless `hidden: true`. The section comes from
     * `creatureType` (dark_creature -> Dark Creatures, beast/nature -> Beasts, otherwise Other).
     */
    bestiary?: { abilityIds: string[]; hidden?: boolean };
    /** Light Hate keyword parameters; absent = not weakened by light. */
    lightHate?: LightHateDef;
    /** Base spawn template used by wave/continuous spawns (`LevelEventManager`); absent = not spawnable by characterId. */
    baseSpawn?: EnemySpawnDef;
    characterSpriteKey?: string;
    hp?: number;
    speed?: number;
    /** Size category; radius derived from UNIT_SIZE_MAP. Overrides radius if both set. */
    size?: UnitSize;
    radius?: number;
    stamina?: number;
    stackSize?: number;
    perceptionRange?: number;
    /** Hunter AI (`alphaWolfBoss` tree) locks onto one random visible enemy as prey and keeps chasing it, instead of attacking the first enemy in sight. */
    huntsSinglePrey?: boolean;
    onDeathVisualEffects?: VisualEffectDef[];
    /**
     * Components this character carries (see `units/components/unitComponent.ts`): per-unit state slices that
     * serialize themselves and may hook tick, round milestones and death. Build entries with `componentSpec`.
     * Death behaviour that is not a visual effect belongs in a component's `onDeath` hook.
     */
    components?: UnitComponentSpec<any, any>[];
    /** Cinematic death (pause → animation → resume), e.g. bosses. Replaces onDeathVisualEffects. */
    deathSequence?: DeathSequenceDef;
    /** Darkness vs natural beast; drives expectations for death/damage presentation and copy. */
    creatureType?: CreatureType;
    /** Short flavor text for battle UI (e.g. timeline hover). */
    uiDescription?: string;
    combatCc?: UnitCombatCcDef;
    /**
     * Ordered, one-way phases (boss phases, elite enrages) for units of this character type; work on any unit, not
     * only bosses. State lives in the serialized `phase` unit component, attached automatically (see
     * `getUnitComponentSpecs`). A plain enrage is `[enragePreset(threshold)]`. See `units/components/phaseDef.ts`.
     */
    phases?: UnitPhaseDef[];
    /** Max unit objects of this type that can share one tile (tile-space share = 1/maxPerTile per object).
     *  undefined = exempt from the occupancy system entirely. */
    maxPerTile?: number;
    /** Z-index-like shove priority. A unit can enter cells occupied by units with strictly lower priority,
     *  displacing them reactively. undefined = cannot shove. */
    shovePriority?: number;
    /** Spawn animation played when this unit enters via darknessSpawn. Absent = default dark vortex (0.5 s). */
    spawnDef?: SpawnAnimationDef;
    /** Opts this character into `MapNetworkManager`'s per-tick node membership tracking.
     *  undefined/false = invisible to the network, exactly like unmanaged units and `CellOccupancyManager`. */
    participatesInMapNetwork?: boolean;
    /** Static tags every spawn of this character type carries (e.g. `UnitTag.Structure`). Merged
     *  with any per-spawn `SpawnDefinition.unitTags` at construction time in
     *  `createUnitFromSpawnConfig` — additive only, never removes a tag a spawn config also sets. */
    tags?: UnitTag[];
    /**
     * Resources attached to every spawn of this character, with their starting `current` value
     * (e.g. `{ super: 2 }` for the Displacer Spirit). Applied in `createUnitFromSpawnConfig`.
     */
    startingResources?: Partial<Record<'super', number>>;
    /**
     * One-time damage a unit that cannot be pushed out of a wall (`UnitTag.Structure`) takes when
     * rock rises on its tile. Instead of being slingshotted out (or bouncing for repeated wall
     * damage), the structure shatters the rock (it becomes rubble) and takes this damage once.
     * Defaults to `DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE`. See `unitWallUnstick.ts`.
     */
    terrainCrushDamage?: number;
    /**
     * Display-only wiggle radius (px). When set, the renderer eases the unit's sprite around a
     * random point within this radius. Purely local presentation: never touches engine state.
     */
    displayWiggleRadius?: number;
}

const UNIT_DEFS: Record<UnitDefId, UnitDefEntry> = {
    // All player units: baseline stats; portrait defs may override body color and size on the token.
    player: {
        bodyColor: 0x4b5563,
        hp: 50,
        speed: 90,
        size: 'Medium',
        stamina: 2,
        uiDescription: 'Adventurer — stats and abilities from equipment and research.',
    },
    // Enemies
    slime: {
        bodyColor: 0x555555,
        displayName: 'Slime',
        sprite: UNIT_SPRITE_URLS.slime,
        bestiary: { abilityIds: ['0001'] },
        baseSpawn: SLIME,
        characterSpriteKey: 'slime',
        hp: 20,
        speed: 50,
        size: 'Medium',
        stamina: 1,
        perceptionRange: 400,
        creatureType: 'dark_creature',
        onDeathVisualEffects: darkCreatureIconFlashVFX(5),
        uiDescription: 'Gelatinous dark creature that keeps its distance and lobs globs of slime.',
        maxPerTile: 1,
    },
    dark_wolf: {
        bodyColor: 0x1a1a2e,
        displayName: 'Wolf',
        sprite: UNIT_SPRITE_URLS.dark_wolf,
        bestiary: { abilityIds: ['0003'] },
        baseSpawn: ENEMY_DARK_WOLF,
        characterSpriteKey: 'dark_wolf',
        hp: 12,
        speed: 120,
        size: 'Extra Small',
        stamina: 1,
        perceptionRange: 300,
        creatureType: 'dark_creature',
        onDeathVisualEffects: darkCreatureIconFlashVFX(5),
        uiDescription: 'Fast predator that lunges in for a quick bite.',
        maxPerTile: 2,
    },
    alpha_wolf: {
        bodyColor: 0x1a1a2e,
        displayName: 'Alpha Wolf',
        sprite: UNIT_SPRITE_URLS.alpha_wolf,
        bestiary: { abilityIds: ['0005', '0007', '0011', '0012'] },
        baseSpawn: ENEMY_ALPHA_WOLF,
        characterSpriteKey: 'alpha_wolf',
        hp: 173,
        speed: 135,
        size: 'Extra Large',
        stamina: 2,
        perceptionRange: 350,
        huntsSinglePrey: true,
        creatureType: 'dark_creature',
        uiDescription: 'Pack leader with heavy claws and howling support.',
        combatCc: {
            ccDurationResistPct: { ALL: 0.5 },
            hardCcArmourFloor: 2,
            chainCcDecayRounds: 0,
            ccArmourBreakStunDuration: 5,
            knockbackResistance: 2,
        },
        phases: [enragePreset(ALPHA_WOLF_ENRAGE_THRESHOLD)],
        deathSequence: ALPHA_WOLF_DEATH_SEQUENCE,
    },
    boar: {
        bodyColor: 0x4a3728,
        displayName: 'Boar',
        sprite: UNIT_SPRITE_URLS.boar,
        bestiary: { abilityIds: ['0006'] },
        baseSpawn: ENEMY_BOAR,
        characterSpriteKey: 'boar',
        hp: 54,
        speed: 100,
        size: 'Large',
        stamina: 2,
        perceptionRange: 280,
        onDeathVisualEffects: darkCreatureParticleBurstVFX(5),
        uiDescription: 'Tough charger that bowls through the front line.',
    },
    thornbinder: {
        bodyColor: 0x3d2c4a,
        displayName: 'Thornbinder',
        sprite: UNIT_SPRITE_URLS.thornbinder,
        bestiary: { abilityIds: ['0008'] },
        baseSpawn: ENEMY_THORNBINDER,
        lightHate: { threshold: DarknessLevel.BRIGHT_LIGHT },
        characterSpriteKey: 'thornbinder',
        hp: 42,
        speed: 34,
        size: 'Large',
        stamina: 1,
        perceptionRange: 380,
        creatureType: 'dark_creature',
        onDeathVisualEffects: darkCreatureIconFlashVFX(5),
        uiDescription:
            'Zone controller — slams bramble into the ground, slowing foes. Weakens in bright light (Light Hate).',
    },
    swarmling: {
        bodyColor: 0x1a1a2e,
        displayName: 'Swarmling',
        sprite: UNIT_SPRITE_URLS.swarmling,
        bestiary: { abilityIds: ['0013'] },
        baseSpawn: ENEMY_SWARMLING,
        characterSpriteKey: 'swarmling',
        hp: 4,
        speed: 45,
        size: 'Diminutive',
        stamina: 2,
        perceptionRange: 250,
        creatureType: 'dark_creature',
        onDeathVisualEffects: darkCreatureIconFlashVFX(4),
        uiDescription: 'Fast skittering biter — snaps twice per round.',
        maxPerTile: 3,
        spawnDef: { type: 'burstRise', duration: 0.6, riseHeight: 24 },
        participatesInMapNetwork: true,
        components: [componentSpec(SWARM_COMPONENT, { role: 'swarmling' })],
    },
    displacer_spirit: {
        bodyColor: 0x1e3a5f,
        displayName: 'Displacer Spirit',
        sprite: UNIT_SPRITE_URLS.displacer_spirit,
        bestiary: { abilityIds: ['0017', '0018', '0019'] },
        characterSpriteKey: 'displacer_spirit',
        hp: 120,
        // Slime is 50; a bit above that (no ghost unit def exists yet — see mission notes).
        speed: 65,
        size: 'Small',
        stamina: 1,
        perceptionRange: 400,
        creatureType: 'dark_creature',
        deathSequence: DISPLACER_SPIRIT_DEATH_SEQUENCE,
        uiDescription:
            'Boss spirit that hurls long-flying bolts, eats light to explode, and conjures wiggling decoys.',
        maxPerTile: 1,
        startingResources: { super: 2 },
        displayWiggleRadius: 10,
        // Enrages at half health, like the alpha wolf: bigger decoys, a double-tap bolt, a denser light-eater ring.
        phases: [enragePreset(0.5)],
    },
    displacer_clone: {
        bodyColor: 0x1e3a5f,
        displayName: 'Displacer Clone',
        sprite: UNIT_SPRITE_URLS.displacer_spirit,
        bestiary: { abilityIds: ['0017'] },
        // Same sprite and size as the Displacer Spirit.
        characterSpriteKey: 'displacer_spirit',
        hp: 6,
        speed: 65,
        size: 'Small',
        stamina: 1,
        perceptionRange: 400,
        creatureType: 'dark_creature',
        onDeathVisualEffects: darkCreatureIconFlashVFX(5),
        uiDescription: 'Illusory copy of the Displacer Spirit. Mimics its bolts; fragile.',
        maxPerTile: 1,
        tags: [UnitTag.Clone],
        displayWiggleRadius: 10,
    },
    lanternite: {
        bodyColor: 0x34d399,
        displayName: 'Lanternite',
        sprite: UNIT_SPRITE_URLS.lanternite,
        bestiary: { abilityIds: ['0010'] },
        baseSpawn: ALLY_LANTERNITE,
        characterSpriteKey: 'lanternite',
        hp: 20,
        speed: 70,
        size: 'Extra Small',
        stamina: 1,
        perceptionRange: 260,
        creatureType: 'nature',
        components: [componentSpec(LANTERNITE_COMPONENT, { role: 'creature' })],
        uiDescription:
            'Lantern-bearing creature — pulses light up to four times each round (Soul Sap) and wanders patrol routes beside its nest.',
        participatesInMapNetwork: true,
    },
    lanternite_nest: {
        bodyColor: 0x065f46,
        displayName: 'Lanternite Nest',
        sprite: UNIT_SPRITE_URLS.lanternite_nest,
        bestiary: { abilityIds: ['0014'] },
        characterSpriteKey: 'curling_vines',
        hp: 16, // playtest: -20% (was 20)
        speed: 0,
        size: 'Extra Large',
        stamina: 1,
        perceptionRange: 0,
        creatureType: 'nature',
        uiDescription:
            'Living nursery — births lantern scouts on a rhythm; needs protection when stirred.',
        participatesInMapNetwork: true,
        tags: [UnitTag.Structure],
        components: [componentSpec(LANTERNITE_COMPONENT, { role: 'nest' })],
    },
    swarm_nest: {
        bodyColor: 0x3d0000,
        displayName: 'Swarm Nest',
        sprite: UNIT_SPRITE_URLS.swarm_nest,
        bestiary: { abilityIds: [] },
        characterSpriteKey: 'lanternite_nest',
        hp: 80, // playtest: -20% (was 100)
        speed: 0,
        size: 'Extra Large',
        stamina: 1,
        perceptionRange: 0,
        creatureType: 'dark_creature',
        onDeathVisualEffects: darkCreatureParticleBurstVFX(5),
        uiDescription: 'Swarm Nest — spawns skittering swarmlings that seek out other nest sites.',
        participatesInMapNetwork: true,
        tags: [UnitTag.Structure],
        components: [componentSpec(SWARM_COMPONENT, { role: 'nest' })],
    },
    dog: {
        bodyColor: 0x8a5a2b,
        displayName: 'Dog',
        sprite: UNIT_SPRITE_URLS.dog,
        bestiary: { abilityIds: ['0701'] },
        characterSpriteKey: 'dog',
        hp: 48,
        speed: 140,
        size: 'Small',
        stamina: 2,
        perceptionRange: 250,
        creatureType: 'beast',
        uiDescription: 'Loyal hound — fights close to its master, biting enemies that stray too near.',
    },
};

/** Enemy def ids (every def except the player), in registry order. */
export function getEnemyUnitDefIds(): EnemyUnitId[] {
    return (Object.keys(UNIT_DEFS) as UnitDefId[]).filter((id): id is EnemyUnitId => id !== PLAYER_CHARACTER_ID);
}

/** Bestiary section for a def, derived from `creatureType`. */
export type BestiaryFaction = 'dark_creature' | 'beast' | 'other';

export function getBestiaryFaction(characterId: string): BestiaryFaction {
    const t = UNIT_DEFS[characterId as UnitDefId]?.creatureType;
    if (t === 'dark_creature') return 'dark_creature';
    if (t === 'beast' || t === 'nature') return 'beast';
    return 'other';
}

/** Enemy ids that appear in the Bestiary (have a `bestiary` entry that is not hidden), in registry order. */
export function getBestiaryUnitIds(): EnemyUnitId[] {
    return getEnemyUnitDefIds().filter((id) => {
        const b = UNIT_DEFS[id].bestiary;
        return b != null && !b.hidden;
    });
}

/** Art URL for a character id's icon (Bestiary, timeline), or undefined. */
export function getUnitSpriteUrl(characterId: string): string | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.sprite;
}

/** Light Hate parameters for a character id, if it opts in. */
export function getUnitLightHateDef(characterId: string): LightHateDef | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.lightHate;
}

/** Base spawn templates keyed by characterId, for every def that declares `baseSpawn`. */
export function getBaseSpawnDefs(): Record<string, EnemySpawnDef> {
    const out: Record<string, EnemySpawnDef> = {};
    for (const id of getEnemyUnitDefIds()) {
        const t = UNIT_DEFS[id].baseSpawn;
        if (t) out[id] = t;
    }
    return out;
}

/** Display-only sprite wiggle radius (px) for a character id; 0 when it does not wiggle. */
export function getUnitDisplayWiggleRadius(characterId: string): number {
    return UNIT_DEFS[characterId as UnitDefId]?.displayWiggleRadius ?? 0;
}

/** Resources (and starting values) attached to every spawn of this character id. */
export function getUnitStartingResources(characterId: string): Partial<Record<'super', number>> {
    return UNIT_DEFS[characterId as UnitDefId]?.startingResources ?? {};
}

/** Optional CC spawn data for a character id (undefined when none). */
export function getUnitCombatCcDef(characterId: string): UnitCombatCcDef | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.combatCc;
}

/** Read-only access to a unit's static data (hp, speed, description, etc.). */
export function getUnitDefEntry(characterId: UnitDefId): UnitDefEntry | undefined {
    return UNIT_DEFS[characterId];
}

/**
 * Components a character's def declares (undefined when none). A def with `phases` also gets the `phase`
 * component (options = its phase list), so defs never declare it by hand.
 */
export function getUnitComponentSpecs(characterId: string): readonly UnitComponentSpec<any, any>[] | undefined {
    const def = UNIT_DEFS[characterId as UnitDefId];
    if (!def?.phases?.length) return def?.components;
    return [...(def.components ?? []), componentSpec(PHASE_COMPONENT, { phases: def.phases })];
}

/** Phases a character's def declares (undefined when none). */
export function getUnitPhases(characterId: string): readonly UnitPhaseDef[] | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.phases;
}

function unitIsDarkCreature(unit: Unit): boolean {
    return UNIT_DEFS[unit.characterId as UnitDefId]?.creatureType === 'dark_creature';
}

/** True when this character uses dark-creature presentation (tint, quick death flash, etc.). */
export function isDarkCreatureCharacterId(characterId: string): boolean {
    return UNIT_DEFS[characterId as UnitDefId]?.creatureType === 'dark_creature';
}

function ensureDarkCreatureIconTint(visual: Container, unit: Unit, characterTexture: Texture): void {
    if (!unitIsDarkCreature(unit)) return;
    const charSprite = visual.children.find((c) => c.label === 'characterSprite') as Sprite | undefined;
    if (!charSprite) return;
    let tint = visual.children.find((c) => c.label === 'darkCreatureIconTint') as Sprite | undefined;
    if (!tint) {
        tint = new Sprite(characterTexture);
        tint.label = 'darkCreatureIconTint';
        tint.anchor.set(0.5, 0.5);
        tint.blendMode = 'multiply';
        tint.tint = DARK_CREATURE_CORRUPTION_TINT;
        tint.alpha = DARK_CREATURE_ICON_TINT_ALPHA;
        const tintMask = new Graphics();
        tintMask.circle(0, 0, unit.radius);
        tintMask.fill(0xffffff);
        tintMask.label = 'darkCreatureIconTintMask';
        const insertAt = visual.getChildIndex(charSprite) + 1;
        visual.addChildAt(tintMask, insertAt);
        visual.addChildAt(tint, insertAt + 1);
        tint.mask = tintMask;
    } else {
        tint.texture = characterTexture;
    }
    tint.width = charSprite.width;
    tint.height = charSprite.height;
}

/** Token fill behind the portrait sprite; portrait battle model may override. */
export function resolvePlayerBodyColor(portraitId: string | undefined): number {
    const base = UNIT_DEFS.player.bodyColor;
    if (!portraitId) return base;
    const p = getPortrait(portraitId);
    return p?.battleModel.bodyColor ?? base;
}

/** Hitbox radius from global player default and optional portrait size override. */
export function resolvePlayerUnitRadius(portraitId: string | undefined): number {
    const baseSize = UNIT_DEFS.player.size ?? DEFAULT_UNIT_SIZE;
    const baseR = UNIT_SIZE_MAP[baseSize];
    if (!portraitId) return baseR;
    const p = getPortrait(portraitId);
    if (p?.battleModel.size) return UNIT_SIZE_MAP[p.battleModel.size];
    return baseR;
}

export function getDefaultRadius(characterId: string, fallbackRadius: number): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    if (def?.size) return UNIT_SIZE_MAP[def.size];
    return def?.radius ?? fallbackRadius;
}

const DEFAULT_BODY_COLOR = 0x555555;

/** Default unit def: draws glow, optional player ring, body circle, optional character sprite, initial label, HP bar. */
class DefaultUnitDef implements IUnitDef {
    createVisual(unit: Unit, context: IUnitRenderContext): Container {
        const container = new Container();
        const isEnemy = areEnemies(context.localTeamId, unit.teamId);
        const glowColor = isEnemy
            ? ENEMY_GLOW_COLOR
            : unit.teamId === 'nature'
                ? NATURE_GLOW_COLOR
                : unit.isPlayerControlled()
                    ? ALLY_PLAYER_GLOW_COLOR
                    : ALLY_PET_GLOW_COLOR;
        const glowAlpha = isEnemy ? 0.3 : unit.teamId === 'nature' ? 0.45 : unit.isPlayerControlled() ? 0.4 : 0.55;
        const def = UNIT_DEFS[unit.characterId as UnitDefId] ?? { bodyColor: DEFAULT_BODY_COLOR };

        const playerPortrait =
            unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId
                ? getPortrait(unit.portraitId)
                : undefined;

        const bodyColor = playerPortrait
            ? (playerPortrait.battleModel.bodyColor ?? UNIT_DEFS.player.bodyColor)
            : (def.bodyColor ?? DEFAULT_BODY_COLOR);

        let characterTexture: Texture | null = null;
        if (unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId) {
            characterTexture = context.getPlayerPortraitTexture(unit.portraitId);
        } else if (def.characterSpriteKey) {
            characterTexture = context.getCharacterTexture(def.characterSpriteKey);
        }
        const showCharacterSprite = Boolean(characterTexture);

        // Glow circle
        const glow = new Graphics();
        glow.circle(0, 0, unit.radius + GLOW_RADIUS);
        glow.fill({ color: glowColor, alpha: glowAlpha });
        glow.label = 'glow';
        container.addChild(glow);

        // Player color ring (if player-owned)
        if (unit.isPlayerControlled()) {
            const playerRing = new Graphics();
            playerRing.circle(0, 0, unit.radius + 2);
            playerRing.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
            playerRing.label = 'playerRing';
            container.addChild(playerRing);
        }

        // Body circle
        const body = new Graphics();
        body.circle(0, 0, unit.radius);
        body.fill(bodyColor);
        body.stroke({ color: 0x000000, width: 1 });
        body.label = 'body';
        container.addChild(body);

        // Inner circle (optional, from portrait battle model)
        const innerCircleDef = playerPortrait?.battleModel.innerCircle;
        if (innerCircleDef) {
            const inner = new Graphics();
            inner.circle(0, 0, unit.radius * innerCircleDef.radiusRatio);
            inner.fill(innerCircleDef.color);
            inner.label = 'innerCircle';
            container.addChild(inner);
        }

        // Character sprite (e.g. slime SVG for the slime unit, or model image for player portraits)
        if (showCharacterSprite && characterTexture) {
            ensureUnitCharacterSprite(container, unit, characterTexture, true);
        }

        const hpBarSize = getHpBarSize(unit);

        const hpBg = new Graphics();
        hpBg.label = 'hpBg';
        hpBg.visible = hpBarSize !== 'hidden';
        if (hpBarSize === 'large') {
            hpBg.rect(-unit.radius, -unit.radius - 14, unit.radius * 2, 10);
        } else if (hpBarSize === 'small') {
            hpBg.rect(-unit.radius, -unit.radius - 8, unit.radius * 2, 5);
        }
        if (hpBarSize !== 'hidden') hpBg.fill({ color: 0x333333, alpha: 0.8 });
        container.addChild(hpBg);

        const hpFill = new Graphics();
        hpFill.label = 'hpFill';
        hpFill.visible = hpBarSize !== 'hidden';
        container.addChild(hpFill);

        const hpInjury = new Graphics();
        hpInjury.label = 'hpInjury';
        hpInjury.visible = hpBarSize !== 'hidden';
        container.addChild(hpInjury);

        // Stack count badge: shown to the left of the HP bar when stackSize > 1
        if (hpBarSize !== 'hidden') {
            const stackBadge = createBadge('', { radius: 7 });
            stackBadge.label = 'stackBadge';
            stackBadge.visible = false;
            const barYCenter = hpBarSize === 'large' ? (-unit.radius - 14 + 5) : (-unit.radius - 8 + 2.5);
            stackBadge.x = -unit.radius - 10;
            stackBadge.y = barYCenter;
            container.addChild(stackBadge);
        }

        if (hpBarSize === 'large') {
            const style = new TextStyle({ fontSize: 8, fontWeight: 'bold', fill: 0x000000 });
            const label = new Text({ text: unit.name.slice(0, 6).toUpperCase(), style });
            label.anchor.set(0.5, 0.5);
            label.x = 0;
            label.y = -unit.radius - 9;
            label.label = 'label';
            container.addChild(label);
        }

        return container;
    }
}

const defaultUnitDef = new DefaultUnitDef();

/** Get the unit def for a character ID. */
export function getUnitDef(_characterId: string): IUnitDef {
    return defaultUnitDef;
}

/** Character sprite key for a character ID (for effects that mimic unit appearance). */
export function getCharacterSpriteKey(characterId: string): string | undefined {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.characterSpriteKey;
}

/** Body color for a character ID (for restoring unit visual after full-darkness mode). */
export function getBodyColor(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.bodyColor ?? DEFAULT_BODY_COLOR;
}

/** Additive color blend clamping each channel at 255. */
function blendAdditive(base: number, add: number): number {
    const r = Math.min(255, ((base >> 16) & 0xff) + ((add >> 16) & 0xff));
    const g = Math.min(255, ((base >> 8) & 0xff) + ((add >> 8) & 0xff));
    const b = Math.min(255, (base & 0xff) + (add & 0xff));
    return (r << 16) | (g << 8) | b;
}

/** Body color for a unit instance (player tokens use portrait overrides). */
export function getBodyColorForUnit(unit: Unit): number {
    const base = unit.characterId === PLAYER_CHARACTER_ID
        ? resolvePlayerBodyColor(unit.portraitId)
        : getBodyColor(unit.characterId);
    if (unit.tags.includes(UnitTag.Enraged)) {
        return blendAdditive(base, 0x550000);
    }
    return base;
}

/** Default HP for a character ID. Used when creating units without explicit hp. Returns 50 if not configured. */
export function getDefaultHp(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.hp ?? 50;
}

/** Battle UI blurb for tooltips (timeline hover, etc.). Placeholder when not configured. */
export function getUnitUiDescription(characterId: string): string {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.uiDescription ?? 'No unit description yet.';
}

/** Default speed for a character ID. Used when creating units without explicit speed. Returns 100 if not configured. */
export function getDefaultSpeed(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.speed ?? 100;
}

/** Default stamina for a character ID. */
export function getDefaultStamina(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.stamina ?? 1;
}

/**
 * Single source of truth for enemy baseline hp/speed: unit defs, with optional mission/spawn overrides.
 */
export function resolveEnemySpawnStats(partial: {
    characterId: string;
    hp?: number;
    speed?: number;
    stackSize?: number;
}): { hp: number; speed: number; stackSize: number } {
    const def = UNIT_DEFS[partial.characterId as UnitDefId];
    return {
        hp: partial.hp ?? getDefaultHp(partial.characterId),
        speed: partial.speed ?? getDefaultSpeed(partial.characterId),
        stackSize: partial.stackSize ?? def?.stackSize ?? 1,
    };
}

/** Perception range in px for AI (line-of-sight targeting). Returns 300 if not configured. */
export function getPerceptionRange(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.perceptionRange ?? 300;
}

/** True when the character's hunter AI picks and keeps a single prey (see `UnitDefEntry.huntsSinglePrey`). */
export function getUnitHuntsSinglePrey(characterId: string): boolean {
    return UNIT_DEFS[characterId as UnitDefId]?.huntsSinglePrey === true;
}

/** Creature category from unit defs; undefined when unset (treat as uncategorized for new-enemy workflows). */
export function getCreatureType(characterId: string): CreatureType | undefined {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.creatureType;
}

/** Max unit objects of this type that can share one tile. undefined = exempt from occupancy system. */
export function getUnitMaxPerTile(characterId: string): number | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.maxPerTile;
}

/** Whether this character type opts into `MapNetworkManager` node-membership tracking. Defaults to false. */
export function getUnitParticipatesInMapNetwork(characterId: string): boolean {
    return UNIT_DEFS[characterId as UnitDefId]?.participatesInMapNetwork ?? false;
}

/** Default one-time damage a structure takes when it shatters rock raised on its tile. */
export const DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE = 10;

/** Per-character `terrainCrushDamage`, falling back to `DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE`. */
export function getUnitTerrainCrushDamage(characterId: string): number {
    return UNIT_DEFS[characterId as UnitDefId]?.terrainCrushDamage ?? DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE;
}

/** Static per-characterId tags (e.g. `UnitTag.Structure`). Defaults to `[]`. */
export function getUnitStaticTags(characterId: string): UnitTag[] {
    return UNIT_DEFS[characterId as UnitDefId]?.tags ?? [];
}

/** Shove priority for the unit. undefined = cannot shove other units. */
export function getUnitShovePriority(characterId: string): number | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.shovePriority;
}

/** Spawn animation definition for a character (undefined = use default dark vortex 0.5 s). */
export function getUnitSpawnDef(characterId: string): SpawnAnimationDef | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.spawnDef;
}

/**
 * Create a unit visual. Uses the unit's characterId to look up the UnitDef and delegates drawing.
 */
export function renderUnit(unit: Unit, context: IUnitRenderContext): Container {
    const def = getUnitDef(unit.characterId);
    return def.createVisual(unit, context);
}

/** Update the HP bar child inside a unit visual container. Call each frame from GameRenderer. */
export function updateUnitHpBar(visual: Container, unit: Unit): void {
    const hpFill = visual.children.find((c) => c.label === 'hpFill') as Graphics | undefined;
    if (!hpFill || !hpFill.visible) return;
    hpFill.clear();
    const ratio = unit.hp / unit.maxHp;
    const barWidth = unit.radius * 2 * ratio;
    const barColor = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;
    const hpBarSize = getHpBarSize(unit);
    const barY = hpBarSize === 'large' ? -unit.radius - 14 : -unit.radius - 8;
    const barHeight = hpBarSize === 'large' ? 10 : 5;
    hpFill.rect(-unit.radius, barY, barWidth, barHeight);
    hpFill.fill(barColor);

    const barFullWidth = unit.radius * 2;
    const hpInjury = visual.children.find((c) => c.label === 'hpInjury') as Graphics | undefined;
    if (hpInjury) {
        hpInjury.clear();
        if (unit.hpInjury > 0 && unit.maxHp > 0) {
            const injuryWidth = Math.min(barFullWidth, barFullWidth * (unit.hpInjury / unit.maxHp));
            hpInjury.rect(unit.radius - injuryWidth, barY, injuryWidth, barHeight);
            hpInjury.fill(0x000000);
        }
    }

    const stackBadge = visual.children.find((c) => c.label === 'stackBadge') as Container | undefined;
    if (stackBadge) {
        const show = unit.stackSize > 1;
        stackBadge.visible = show;
        if (show) updateBadgeText(stackBadge, String(unit.stackSize));
    }
}

/**
 * Ensures a character sprite exists and uses `texture`, sized for the unit's radius.
 * Call when assets finish loading after the unit visual was created with a fallback label.
 */
export function ensureUnitCharacterSprite(visual: Container, unit: Unit, texture: Texture, clipToCircle = false): void {
    const spriteSize = clipToCircle ? unit.radius * 2 : unit.radius * 2 * CHARACTER_SPRITE_SCALE;
    let charSprite = visual.children.find((c) => c.label === 'characterSprite') as Sprite | undefined;
    if (!charSprite) {
        charSprite = new Sprite(texture);
        charSprite.anchor.set(0.5, 0.5);
        charSprite.label = 'characterSprite';
        const bodyIdx = visual.children.findIndex((c) => c.label === 'body');
        const insertAt = bodyIdx >= 0 ? bodyIdx + 1 : visual.children.length;
        if (clipToCircle) {
            const mask = new Graphics();
            mask.circle(0, 0, unit.radius);
            mask.fill(0xffffff);
            mask.label = 'characterSpriteMask';
            visual.addChildAt(mask, insertAt);
            visual.addChildAt(charSprite, insertAt + 1);
            charSprite.mask = mask;
        } else {
            visual.addChildAt(charSprite, insertAt);
        }
    } else {
        charSprite.texture = texture;
    }
    charSprite.width = spriteSize;
    charSprite.height = spriteSize;
    ensureDarkCreatureIconTint(visual, unit, texture);
}

/** If a texture is now available for this unit's character sprite key, attach/update the sprite and hide the letter label. */
export function syncUnitCharacterSpriteIfNeeded(visual: Container, unit: Unit, context: IUnitRenderContext): void {
    if (unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId) {
        const texture = context.getPlayerPortraitTexture(unit.portraitId);
        if (!texture) return;
        ensureUnitCharacterSprite(visual, unit, texture, true);
        return;
    }
    const key = getCharacterSpriteKey(unit.characterId);
    if (!key) return;
    const texture = context.getCharacterTexture(key);
    if (!texture) return;
    ensureUnitCharacterSprite(visual, unit, texture, true);
}
