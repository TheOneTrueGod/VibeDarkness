/**
 * Unit components — per-unit state slices (plus optional behaviour hooks) that a unit def opts into,
 * instead of `Unit` growing one field per enemy type.
 *
 * A component type owns:
 * - `create(options)`: default state,
 * - `toJSON(state)` / `fromJSON(state, data)`: its slice of the serialized unit, written at the TOP LEVEL of the
 *   unit JSON with the component's own key names (so adding a component never nests or renames anything),
 * - optional behaviour hooks (`unitComponentHooks.ts`), which live in a separate module so that this file and
 *   the state modules stay free of engine imports (`Unit.ts` imports this file; a heavy import here would be a cycle).
 *
 * State lives in one place on the unit: `unit.components` (a map keyed by component id). Callers use the typed
 * accessors each component module exports (`lanterniteStateOf(unit)`), never the map directly.
 *
 * Declare on a def with `components: [componentSpec(LANTERNITE_COMPONENT, { role: 'nest' })]`. Components that are
 * not tied to one character (e.g. `pet`, which any player unit can own) are attached on first access instead.
 */

import type { Unit } from '../Unit';

/** One attached component: its state plus the options the def declared it with (undefined when attached lazily). */
export interface UnitComponentInstance<S = unknown, O = unknown> {
    state: S;
    options: O | undefined;
}

export interface UnitComponentType<S = unknown, O = unknown> {
    /** Stable id; the key in `unit.components`. */
    readonly id: string;
    /** Default state. `options` is what the def declared (undefined when the component is attached lazily). */
    create(options: O | undefined): S;
    /**
     * Keys to merge into the serialized unit. Omit keys at their default so a fresh component serializes to `{}`
     * (that is what keeps checkpoints byte-compatible with the pre-component shape).
     */
    toJSON(state: S): Record<string, unknown>;
    /** Restore this slice from the serialized unit (the whole unit object; read your own keys, ignore the rest). */
    fromJSON(state: S, data: Record<string, unknown>): void;
}

/** A def's declaration of one component. Build with `componentSpec`. */
export interface UnitComponentSpec<S = unknown, O = unknown> {
    readonly type: UnitComponentType<S, O>;
    readonly options?: O;
}

export function componentSpec<S, O>(type: UnitComponentType<S, O>, options?: O): UnitComponentSpec<S, O> {
    return { type, options };
}

/** Registration order = serialization order and hook dispatch order. Append only; do not reorder shipped types. */
const REGISTRY = new Map<string, UnitComponentType<any, any>>();

export function defineUnitComponent<S, O = undefined>(type: UnitComponentType<S, O>): UnitComponentType<S, O> {
    const existing = REGISTRY.get(type.id);
    if (existing && existing !== type) {
        throw new Error(`Unit component "${type.id}" is already registered`);
    }
    REGISTRY.set(type.id, type);
    return type;
}

export function getUnitComponentType(id: string): UnitComponentType<any, any> | undefined {
    return REGISTRY.get(id);
}

export function listUnitComponentTypes(): UnitComponentType<any, any>[] {
    return [...REGISTRY.values()];
}

/** Attach (or replace) a component on a unit. Used for def-declared components and tests. */
export function attachComponent<S, O>(unit: Unit, spec: UnitComponentSpec<S, O>): UnitComponentInstance<S, O> {
    const instance: UnitComponentInstance<S, O> = {
        state: spec.type.create(spec.options),
        options: spec.options,
    };
    unit.components.set(spec.type.id, instance);
    return instance;
}

/** The component's state if the unit carries it. Use for scans over many units so they never attach empty slices. */
export function findComponentState<S>(unit: Unit, type: UnitComponentType<S, any>): S | undefined {
    return (unit.components.get(type.id) as UnitComponentInstance<S> | undefined)?.state;
}

/** The options the def declared this component with (undefined when absent or attached lazily). */
export function getComponentOptions<O>(unit: Unit, type: UnitComponentType<any, O>): O | undefined {
    return (unit.components.get(type.id) as UnitComponentInstance<unknown, O> | undefined)?.options;
}

/** The component's state, attaching a default instance when the unit does not carry it yet. */
export function getComponentState<S>(unit: Unit, type: UnitComponentType<S, any>): S {
    let instance = unit.components.get(type.id) as UnitComponentInstance<S> | undefined;
    if (!instance) {
        instance = { state: type.create(undefined), options: undefined };
        unit.components.set(type.id, instance);
    }
    return instance.state;
}

/** Attach every component the unit's def declares (called from the `Unit` constructor). */
export function attachDefComponents(unit: Unit, specs: readonly UnitComponentSpec<any, any>[] | undefined): void {
    if (!specs) return;
    for (const spec of specs) attachComponent(unit, spec);
}

/** Merge every attached component's JSON slice, in registry order. */
export function serializeUnitComponents(unit: Unit): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const type of REGISTRY.values()) {
        const instance = unit.components.get(type.id);
        if (instance) Object.assign(out, type.toJSON(instance.state));
    }
    return out;
}

/**
 * Restore component state from a serialized unit. A component the unit does not carry yet is attached only when the
 * checkpoint actually has data for it, so default slices stay absent.
 */
export function applyUnitComponentsFromJSON(unit: Unit, data: Record<string, unknown>): void {
    for (const type of REGISTRY.values()) {
        const instance = unit.components.get(type.id);
        if (instance) {
            type.fromJSON(instance.state, data);
            continue;
        }
        const state = type.create(undefined);
        type.fromJSON(state, data);
        if (Object.keys(type.toJSON(state)).length > 0) {
            unit.components.set(type.id, { state, options: undefined });
        }
    }
}
