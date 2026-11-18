/**
 * Def-level render options for units (`UnitDefEntry.renderOptions`) and the pure functions that resolve them into
 * "what should be drawn right now". No Pixi in here: the painters (`GameRenderer/renderers/unitRenderOptionsVisual.ts`
 * and `UnitGroundMarkRenderer.ts`) read these results, so the rules are unit-testable and the renderer holds no
 * knowledge of any one boss.
 *
 * Three options, each driven by state the unit already has:
 * - `plated`: a closed plated look while any of the unit's flat damage reductions is active (the Garden Heart Shell,
 *   but any armoured unit can opt in), and an open core look once none is.
 * - `burrow`: colours for the ground mask, hole and trail drawn while the unit is mid `burrow` phase transition
 *   (`getBurrowVisual`). Any unit that burrows is drawn sinking; this only restyles it.
 * - fused bodies need no option: any unit with the `fusedBody` component gets a blast circle for its telegraph window
 *   (`resolveFusedBodyTelegraph`), coloured by `FusedBodyOptions.telegraphColor`.
 */

import type { Unit } from './Unit';
import { isFlatReductionActive } from './flatDamageReduction';
import { getUnitDefEntry } from './unit_defs/unitDef';
import { peekPhaseState } from './components/phaseComponent';
import { getBurrowVisual, type BurrowHolder, type BurrowVisual } from './components/phaseBurrow';
import { peekBurrowHopState } from './components/burrowHop';
import { fusedBodyOptionsOf, getFusedBodyStatus } from './components/fusedBodyComponent';

export interface PlatedLookDef {
    /** Plate fill. */
    plateColor: number;
    /** Plate outline and seams. */
    seamColor: number;
    /** Glow along the closed seam, and the exposed core once open. */
    coreColor: number;
}

export interface BurrowLookDef {
    /** Churned earth: the lip round the hole and the trail. */
    dirtColor: number;
}

export interface UnitRenderOptions {
    plated?: PlatedLookDef;
    burrow?: BurrowLookDef;
}

/** Red used for a blast telegraph when the fused body does not set its own. */
export const DEFAULT_TELEGRAPH_COLOR = 0xdc2626;
export const DEFAULT_BURROW_DIRT_COLOR = 0x6b4a1f;
/** The burrow hole's shadow; fixed so every burrower reads the same. */
export const BURROW_HOLE_COLOR = 0x000000;

export function getUnitRenderOptions(characterId: string): UnitRenderOptions | undefined {
    return getUnitDefEntry(characterId as never)?.renderOptions;
}

// ---------------------------------------------------------------------------
// Plated look
// ---------------------------------------------------------------------------

export type PlatedState = 'closed' | 'open';

export interface PlatedLook {
    state: PlatedState;
    def: PlatedLookDef;
}

/** Closed while any of the unit's flat damage reductions is active (e.g. `hasLivingChildren`), open otherwise. */
export function resolvePlatedLook(unit: Unit): PlatedLook | null {
    const def = getUnitRenderOptions(unit.characterId)?.plated;
    if (!def) return null;
    const closed = unit.flatDamageReductions.some((r) => isFlatReductionActive(r, unit));
    return { state: closed ? 'closed' : 'open', def };
}

// ---------------------------------------------------------------------------
// Burrow
// ---------------------------------------------------------------------------

/** How far under the ground line a fully sunk unit is pushed, in unit radii. */
export const BURROW_SINK_RADII = 2.4;
/** World y of the ground line, relative to the unit centre, in unit radii. */
export const BURROW_GROUND_LINE_RADII = 0.95;

export interface BurrowRender {
    visual: BurrowVisual;
    dirtColor: number;
    /** Pixels to move the unit visual down. */
    sinkY: number;
    /** World y the unit visual is clipped below (the ground line). */
    groundLineY: number;
    /** The resprout eruption's blast circle, only while the unit is rising (`BurrowTransitionDef.eruption`). */
    eruption: FusedBodyTelegraph | null;
}

/** The burrow this unit is in, from a phase transition or a hop (`burrowHop`); undefined when neither. */
function burrowHolderOf(unit: Unit): BurrowHolder | undefined {
    const phase = peekPhaseState(unit);
    if (phase?.burrow) return phase;
    const hop = peekBurrowHopState(unit);
    return hop?.burrow ? hop : undefined;
}

export function resolveBurrowRender(unit: Unit, tickTime: number): BurrowRender | null {
    const holder = burrowHolderOf(unit);
    const visual = getBurrowVisual(holder, tickTime);
    if (!visual) return null;
    const burrow = holder?.burrow;
    const eruption: FusedBodyTelegraph | null =
        burrow && burrow.eruptionRadiusPx !== undefined && (burrow.stage === 'rise' || (burrow.eruptionTelegraphFromTravel && burrow.stage === 'travel'))
            ? {
                  x: burrow.toX,
                  y: burrow.toY,
                  radiusPx: burrow.eruptionRadiusPx,
                  // The inner fill grows over the rise; while travelling only the rim marks the spot.
                  fill: burrow.stage === 'rise' ? visual.stageProgress : 0,
                  color: DEFAULT_TELEGRAPH_COLOR,
              }
            : null;
    return {
        visual,
        eruption,
        dirtColor: getUnitRenderOptions(unit.characterId)?.burrow?.dirtColor ?? DEFAULT_BURROW_DIRT_COLOR,
        sinkY: visual.depth * unit.radius * BURROW_SINK_RADII,
        groundLineY: unit.y + unit.radius * BURROW_GROUND_LINE_RADII,
    };
}

// ---------------------------------------------------------------------------
// Fused body telegraph
// ---------------------------------------------------------------------------

export interface FusedBodyTelegraph {
    x: number;
    y: number;
    radiusPx: number;
    /** 0-1 through the telegraph window; the inner fill grows to the burst edge as it reaches 1. */
    fill: number;
    color: number;
}

/** The red blast circle for a fused body inside its telegraph window, else null (also null once it has resolved). */
export function resolveFusedBodyTelegraph(unit: Unit): FusedBodyTelegraph | null {
    const status = getFusedBodyStatus(unit);
    if (!status || !status.telegraphing || !unit.isAlive()) return null;
    const color = fusedBodyOptionsOf(unit)?.telegraphColor ?? DEFAULT_TELEGRAPH_COLOR;
    const fill = status.telegraphSeconds > 0 ? Math.min(1, status.elapsedInTelegraph / status.telegraphSeconds) : 1;
    return { x: status.area.x, y: status.area.y, radiusPx: status.area.radiusPx, fill, color };
}
