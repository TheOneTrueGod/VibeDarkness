/**
 * Behaviour hooks for unit components, and the dispatchers `GameEngine` calls.
 *
 * Hooks are kept apart from `unitComponent.ts` (state, serialization) on purpose: hook modules import spawning and
 * lighting code that imports `Unit`, and `Unit` imports the state side. Keeping them separate avoids that cycle.
 *
 * The engine never names an enemy type. At each hook point it builds one `UnitComponentContext` and calls the matching
 * dispatcher, which walks the registered component types in registration order:
 *
 * | Dispatcher | Called from `GameEngine` | Hook |
 * |---|---|---|
 * | `runUnitComponentTick` | the nest phase of the simulation tick (after lighting, before cleanup) | `tick` for every type, then `lateTick` for every type |
 * | `runUnitComponentRoundMilestone` | the round-start block (after unit round-start work) and the round-half block | `onRoundMilestone` |
 * | `runUnitComponentDeath` | the `unit_died` listener, right after the def's death sequence / visual effects | `onDeath` for each component the dying unit carries |
 *
 * The `phase` component (`phaseHooks.ts`) uses `tick` to end phase transitions and check non-damage phase conditions;
 * HP conditions are also checked by `UnitManager` right after `damage_taken`.
 *
 * `tick`, `lateTick` and `onRoundMilestone` are type-level: they run once per call and iterate `ctx.units` themselves.
 * Many behaviours span units (pooled construction, a nest counting its children), and RNG draws and id allocation must
 * keep a fixed order across units, so one pass per type is the deterministic shape. `onDeath` is per unit.
 *
 * Determinism: hooks run on every client, so they may only use the engine's seeded RNG (`ctx.generateRandomInteger`),
 * `ctx.gameTime` and `ctx.engine` id allocation.
 */

import type { EventBus } from '../../EventBus';
import type { EngineContext } from '../../EngineContext';
import type { GameState } from '../../GameState';
import type { MapSegmentPOI } from '../../../terrain/segmentSchema';
import type { LightSource } from '../../lightSources/LightSource';
import type { EffectEmitter } from '../../effects/EffectEmitter';
import type { MapNetworkManager } from '../../managers/mapNetwork/MapNetworkManager';
import type { SpawnSource } from '../../types';
import type { Unit } from '../Unit';
import type { UnitComponentType } from './unitComponent';
import { LANTERNITE_COMPONENT } from './lanterniteComponent';
import { SWARM_COMPONENT } from './swarmComponent';
import { PHASE_COMPONENT } from './phaseComponent';
import { PHASE_HOOKS } from './phaseHooks';
import { LANTERNITE_HOOKS } from '../../lanternite/lanterniteComponentHooks';
import { SWARM_HOOKS } from '../../lanternite/swarmComponentHooks';

export type UnitComponentMilestone = 'round_start' | 'round_half';

/** Everything a hook may touch. Built by the engine; `dt` is 0 outside the simulation tick. */
export interface UnitComponentContext {
    gameTime: number;
    /** World seconds this tick (0 for milestones and death). */
    dt: number;
    units: Unit[];
    eventBus: EventBus;
    /** The engine, for id allocation and as the `EngineContext` managers expect. */
    engine: EngineContext;
    /** Game state, for per-battle managers a component's hooks drive (e.g. the lanternite respawn queue). */
    state: GameState;
    addUnit(unit: Unit, spawnSource?: SpawnSource): void;
    mapPOIs: readonly MapSegmentPOI[];
    mapNetwork: MapNetworkManager;
    lightLevelEnabled: boolean;
    addLightSource(ls: LightSource): void;
    lightSources: LightSource[];
    addEffectEmitter(emitter: EffectEmitter): void;
    generateRandomInteger(min: number, max: number): number;
}

export interface UnitComponentHooks {
    /** Once per simulation tick, in the nest phase. Iterate `ctx.units` and act on units carrying the component. */
    tick?(ctx: UnitComponentContext): void;
    /** After every type's `tick` (for work that must follow all spawning this tick, such as a respawn queue). */
    lateTick?(ctx: UnitComponentContext): void;
    /** Round start / round half. */
    onRoundMilestone?(milestone: UnitComponentMilestone, ctx: UnitComponentContext): void;
    /** A unit carrying this component died. `ctx.units` still contains it. */
    onDeath?(unit: Unit, ctx: UnitComponentContext): void;
}

interface HookEntry {
    type: UnitComponentType<any, any>;
    hooks: UnitComponentHooks;
}

/** Dispatch order. Lanternite before swarm matches the order the engine ran them in before components existed. */
const HOOK_ENTRIES: HookEntry[] = [
    { type: LANTERNITE_COMPONENT, hooks: LANTERNITE_HOOKS },
    { type: SWARM_COMPONENT, hooks: SWARM_HOOKS },
    // Phases last: they read the world after this tick's spawns, and their `tick` ends transitions then checks conditions.
    { type: PHASE_COMPONENT, hooks: PHASE_HOOKS },
];

/** Append hooks for a component type (tests and future components). Returns a function that unregisters them. */
export function registerUnitComponentHooks(type: UnitComponentType<any, any>, hooks: UnitComponentHooks): () => void {
    const entry: HookEntry = { type, hooks };
    HOOK_ENTRIES.push(entry);
    return () => {
        const i = HOOK_ENTRIES.indexOf(entry);
        if (i >= 0) HOOK_ENTRIES.splice(i, 1);
    };
}

/** Component types that have hooks, in dispatch order. */
export function listHookedComponentIds(): string[] {
    return HOOK_ENTRIES.map((e) => e.type.id);
}

export function runUnitComponentTick(ctx: UnitComponentContext): void {
    for (const e of HOOK_ENTRIES) e.hooks.tick?.(ctx);
    for (const e of HOOK_ENTRIES) e.hooks.lateTick?.(ctx);
}

export function runUnitComponentRoundMilestone(milestone: UnitComponentMilestone, ctx: UnitComponentContext): void {
    for (const e of HOOK_ENTRIES) e.hooks.onRoundMilestone?.(milestone, ctx);
}

export function runUnitComponentDeath(unit: Unit, ctx: UnitComponentContext): void {
    for (const e of HOOK_ENTRIES) {
        if (unit.components.has(e.type.id)) e.hooks.onDeath?.(unit, ctx);
    }
}
