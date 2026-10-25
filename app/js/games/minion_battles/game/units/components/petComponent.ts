import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentState } from './unitComponent';

export interface UnitPetState {
    /** Unit id of the player unit that owns this pet. Set on pet units only. */
    ownerUnitId: string | undefined;
    /** Unit ids of this unit's living pets. Maintained by spawn logic; never set on pets. */
    unitIds: string[];
    /** Pet def id (from PET_DEFS) for pet units. Undefined on non-pet units. */
    defId: string | undefined;
}

export function createPetState(): UnitPetState {
    return {
        ownerUnitId: undefined,
        unitIds: [],
        defId: undefined,
    };
}

function petStateToJSON(state: UnitPetState): Record<string, unknown> {
    return {
        ...(state.ownerUnitId !== undefined ? { petOwnerUnitId: state.ownerUnitId } : {}),
        ...(state.unitIds.length > 0 ? { petUnitIds: [...state.unitIds] } : {}),
        ...(state.defId !== undefined ? { petDefId: state.defId } : {}),
    };
}

function applyPetStateFromJSON(state: UnitPetState, data: Record<string, unknown>): void {
    if (typeof data.petOwnerUnitId === 'string') {
        state.ownerUnitId = data.petOwnerUnitId;
    }
    state.unitIds = Array.isArray(data.petUnitIds)
        ? (data.petUnitIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
    if (typeof data.petDefId === 'string') {
        state.defId = data.petDefId;
    }
}

/**
 * Pet bookkeeping. Cross-cutting: any player unit can own pets and any pet def can be spawned for any owner, so
 * no def declares this component. It is attached on first write (`petStateOf`) and has no behaviour hooks; it uses
 * the component storage only so `Unit` carries no per-feature field and the slice serializes like the others.
 */
export const PET_COMPONENT = defineUnitComponent<UnitPetState>({
    id: 'pet',
    create: () => createPetState(),
    toJSON: petStateToJSON,
    fromJSON: applyPetStateFromJSON,
});

/** Pet state for `unit`, attaching a default slice if the unit does not carry one. Use for writes. */
export function petStateOf(unit: Unit): UnitPetState {
    return getComponentState(unit, PET_COMPONENT);
}

/** Pet state if the unit carries it. Use for reads and scans so non-pet units stay component-free. */
export function peekPetState(unit: Unit): UnitPetState | undefined {
    return findComponentState(unit, PET_COMPONENT);
}
