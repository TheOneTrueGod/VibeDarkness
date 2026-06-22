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

export type PassiveTrigger = PassiveOnTickTrigger;

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

/** Convert up to `count` nearby tiles per trigger to the given terrain effect type. */
export interface PassivePlaceTerrainEffect {
    type: 'place_terrain';
    /** TerrainEffectRecord effectType to place (e.g. 'bramble_slow'). */
    effectType: string;
    /** Pixel radius around the caster to search for eligible cells. */
    range: number;
    /** How many tiles to convert per trigger. */
    count: number;
    /** If set, emits an AuraPulse visual of this radius when at least one tile is placed. */
    pulseRadius?: number;
}

export type PassiveEffect = PassiveAoeDamageEffect | PassivePlaceTerrainEffect;

// ---- Top-level def ----

export interface PassiveDef {
    trigger: PassiveTrigger;
    effects: PassiveEffect[];
}
