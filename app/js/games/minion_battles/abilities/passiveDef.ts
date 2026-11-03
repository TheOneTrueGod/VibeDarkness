/**
 * Typed definitions for passive ability triggers and effects.
 *
 * A PassiveDef is attached to an AbilityStatic via the `passive` field and describes
 * what causes the passive to fire and what it does when triggered. The engine calls
 * processUnitPassives each tick; no cast order is needed.
 */

import type { CreatureType } from '../game/units/unit_defs/unitDef';

// ---- Triggers ----

/** Fires on a recurring game-time interval, independent of round boundaries. */
export interface PassiveOnTickTrigger {
    type: 'onTick';
    /** Seconds between successive triggers (e.g. 1.0 = every 1 s = 1/8 of an 8 s round). */
    intervalSec: number;
}

/**
 * Fires each time the unit's position moves into a different grid cell (walking, being pushed,
 * landing). Dispatched from the unit tick right after tile transitions resolve; never on spawn.
 */
export interface PassiveOnCellEnterTrigger {
    type: 'onCellEnter';
}

export type PassiveTrigger = PassiveOnTickTrigger | PassiveOnCellEnterTrigger;

/** Trigger types that fire from a unit event rather than the clock. */
export type PassiveEventTriggerType = Exclude<PassiveTrigger['type'], 'onTick'>;

// ---- Target filter ----

export interface PassiveTargetFilter {
    /** Restrict to units whose character def has this creature type. */
    creatureType?: CreatureType;
    /** Restrict by team relation to the caster. Default: no restriction. */
    teamRelation?: 'enemy' | 'ally' | 'any';
}

// ---- Effects ----

/** Deal a flat amount of damage to every unit that passes the filter (optionally within a radius). */
export interface PassiveAoeDamageEffect {
    type: 'aoe_damage';
    damage: number;
    /** Pixel radius. Omit for unlimited range (global). */
    range?: number;
    targetFilter: PassiveTargetFilter;
    /**
     * If set, emits an expanding ring visual (effectType `AuraPulse`) from the caster
     * that grows to this pixel radius when the effect fires. Purely cosmetic — does not
     * affect which units are damaged. Requires an `AuraPulse` effect def in the registry.
     */
    pulseRadius?: number;
}

/**
 * Convert nearby tiles to the given terrain effect type. The candidate area is either a pixel
 * circle around the caster (`range`) or a square of cells centred on the caster's cell
 * (`cellRadius`: 1 = 3x3). Exactly one of the two should be set.
 */
export interface PassivePlaceTerrainEffect {
    type: 'place_terrain';
    /** TerrainEffectRecord effectType to place (e.g. 'bramble_slow'). */
    effectType: string;
    /** Layer to place on. Default `'ground'`. */
    layer?: 'ground' | 'air';
    /** Pixel radius around the caster to search for eligible cells. */
    range?: number;
    /** Chebyshev cell radius around the caster's cell (0 = own cell, 1 = 3x3). Takes precedence over `range`. */
    cellRadius?: number;
    /** How many tiles to convert per trigger, nearest first. Omit to convert every eligible tile. */
    count?: number;
    /** Lifetime of each placed tile in seconds (world clock). Omit for permanent. */
    durationSec?: number;
    /**
     * What to do with a cell that already holds this effect type on the same layer:
     * `'skip'` (default) leaves it and picks another cell; `'refresh'` extends its expiry
     * to this placement's expiry (never shortens it).
     */
    onExisting?: 'skip' | 'refresh';
    /** When true, cells that units cannot walk on (walls, deep water) are never converted. */
    skipImpassable?: boolean;
    /** If set, emits an AuraPulse visual of this radius when at least one tile is placed. */
    pulseRadius?: number;
}

export type PassiveEffect = PassiveAoeDamageEffect | PassivePlaceTerrainEffect;

// ---- Top-level def ----

export interface PassiveDef {
    trigger: PassiveTrigger;
    effects: PassiveEffect[];
}
