/**
 * Burrow phase transition runtime: close -> sink -> travel -> rise (see `BurrowTransitionDef` in `phaseDef.ts`).
 *
 * `startBurrow` runs when a phase with `transition.kind === 'burrow'` is entered (from `phaseRuntime.startTransition`,
 * which also supplies the invulnerability: the unit is untargetable for the whole burrow). `tickBurrow` runs once per
 * tick from the phase tick hook. State is serialized (`ActiveBurrow`), all clocks are tick time, nothing is random.
 *
 * Pluggable pieces are NAMED in registries so defs stay plain data:
 *  - point rules (`registerSproutPointRule`): pick the resurfacing point from the candidates. Ships `farthestFromParty`.
 *  - exclusion sources (`registerSproutExclusionSource`): zones to keep away from, computed when choosing (old Briar).
 *  - stage callbacks (`registerBurrowCallback`): run when a stage begins (close the Shell, spawn trail effects).
 *
 * The renderer reads `getBurrowVisual` (stage, progress, trail line) to draw the ground mask and the trail.
 */

import type { EngineContext } from '../../EngineContext';
import type { Unit } from '../Unit';
import { areEnemies } from '../../teams';
import { requestReactionFrame } from '../../reactions/reactionFrame';
import { Effect } from '../../effects/Effect';
import { interruptUnitAbilities } from '../unitAbilityLifecycle';
import {
    BURROW_STAGES,
    type BurrowStage,
    type BurrowTransitionDef,
    type SproutExclusionZone,
} from './phaseDef';
import { phasesOf, type ActiveBurrow, type UnitPhaseState } from './phaseComponent';

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

export interface SproutPointContext {
    unit: Unit;
    engine: EngineContext;
    /** Living units hostile to the burrowing unit. */
    party: readonly Unit[];
    exclusionZones: readonly SproutExclusionZone[];
    minDistanceFromExclusions: number;
}

export type SproutPointRule = (
    candidates: readonly { x: number; y: number }[],
    ctx: SproutPointContext,
) => { x: number; y: number } | null;

export type SproutExclusionSource = (unit: Unit, engine: EngineContext) => SproutExclusionZone[];
export type BurrowCallback = (unit: Unit, engine: EngineContext, stage: BurrowStage) => void;

const POINT_RULES = new Map<string, SproutPointRule>();
const EXCLUSION_SOURCES = new Map<string, SproutExclusionSource>();
const CALLBACKS = new Map<string, BurrowCallback>();

export const FARTHEST_FROM_PARTY_RULE = 'farthestFromParty';

export function registerSproutPointRule(id: string, rule: SproutPointRule): void {
    POINT_RULES.set(id, rule);
}
export function registerSproutExclusionSource(id: string, source: SproutExclusionSource): void {
    EXCLUSION_SOURCES.set(id, source);
}
export function registerBurrowCallback(id: string, cb: BurrowCallback): void {
    CALLBACKS.set(id, cb);
}

/** True when the candidate keeps `minDistance` clear of every zone's edge. */
function clearOfZones(p: { x: number; y: number }, zones: readonly SproutExclusionZone[], minDistance: number): boolean {
    return zones.every((z) => Math.hypot(p.x - z.x, p.y - z.y) - z.radius >= minDistance);
}

/** Distance from `p` to the nearest party member (Infinity with no party). */
function nearestPartyDistance(p: { x: number; y: number }, party: readonly Unit[]): number {
    let best = Infinity;
    for (const u of party) best = Math.min(best, Math.hypot(p.x - u.x, p.y - u.y));
    return best;
}

/**
 * Default rule: of the candidates that are passable and clear of the exclusion zones, the one whose nearest party
 * member is farthest away (first in list wins a tie). If the zones rule out every candidate they are relaxed (the unit
 * must still resurface somewhere); impassable candidates are never used. Null only when nothing is passable.
 */
const farthestFromParty: SproutPointRule = (candidates, ctx) => {
    const tm = ctx.engine.terrainManager;
    const passable = candidates.filter((c) => !tm || tm.isPassable(c.x, c.y));
    const clear = passable.filter((c) => clearOfZones(c, ctx.exclusionZones, ctx.minDistanceFromExclusions));
    const pool = clear.length > 0 ? clear : passable;
    let best: { x: number; y: number } | null = null;
    let bestDist = -1;
    for (const c of pool) {
        const d = nearestPartyDistance(c, ctx.party);
        if (d > bestDist) {
            best = c;
            bestDist = d;
        }
    }
    return best;
};
registerSproutPointRule(FARTHEST_FROM_PARTY_RULE, farthestFromParty);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Total length of a burrow transition (tick-time seconds). */
export function burrowTotalSeconds(def: BurrowTransitionDef): number {
    return BURROW_STAGES.reduce((sum, s) => sum + stageSeconds(def, s), 0);
}

function stageSeconds(def: BurrowTransitionDef, stage: BurrowStage): number {
    const v = { close: def.closeSeconds, sink: def.sinkSeconds, travel: def.travelSeconds, rise: def.riseSeconds }[stage];
    return Math.max(0, v);
}

function findBurrowDef(unit: Unit, phaseId: string): BurrowTransitionDef | undefined {
    return phasesOf(unit).find((p) => p.id === phaseId)?.transition?.burrow;
}

function chooseSproutPoint(unit: Unit, def: BurrowTransitionDef, engine: EngineContext): { x: number; y: number } {
    const zones: SproutExclusionZone[] = [...(def.exclusionZones ?? [])];
    for (const id of def.exclusionSources ?? []) zones.push(...(EXCLUSION_SOURCES.get(id)?.(unit, engine) ?? []));
    const party = engine.units.filter((u) => u.id !== unit.id && u.isAlive() && areEnemies(unit.teamId, u.teamId));
    const rule = POINT_RULES.get(def.pointRule ?? FARTHEST_FROM_PARTY_RULE);
    if (!rule) console.warn(`[phases] burrow: unknown point rule "${def.pointRule}"`);
    const point = rule?.(def.sproutPoints, {
        unit,
        engine,
        party,
        exclusionZones: zones,
        minDistanceFromExclusions: def.minDistanceFromExclusions ?? 0,
    });
    return point ?? { x: unit.x, y: unit.y }; // nowhere valid: resurface where it sank
}

function runCallback(def: BurrowTransitionDef, stage: BurrowStage, unit: Unit, engine: EngineContext): void {
    const id = def.callbacks?.[stage];
    if (id === undefined) return;
    const cb = CALLBACKS.get(id);
    if (!cb) console.warn(`[phases] burrow: unknown callback "${id}"`);
    cb?.(unit, engine, stage);
}

/**
 * Whatever holds a burrow in progress: the `phase` component (a burrow transition) or the `burrowHop` component
 * (a node hopping a short way). The stage machine below works on any holder.
 */
export interface BurrowHolder {
    burrow: ActiveBurrow | null;
}

/** Begin a phase's burrow: pick the sprout point, then `beginBurrow`. */
export function startBurrow(unit: Unit, state: UnitPhaseState, phaseId: string, def: BurrowTransitionDef, engine: EngineContext): void {
    beginBurrow(unit, state, phaseId, def, chooseSproutPoint(unit, def, engine), engine);
}

/**
 * Begin a burrow to a chosen point: interrupt the unit and enter the `close` stage. `sourceId` names what started it
 * (the phase id, or the hop component's id). Drive it with `advanceBurrow` once per tick.
 */
export function beginBurrow(
    unit: Unit,
    state: BurrowHolder,
    sourceId: string,
    def: BurrowTransitionDef,
    to: { x: number; y: number },
    engine: EngineContext,
): void {
    interruptUnitAbilities(unit, engine);
    unit.clearMovement();
    state.burrow = {
        phaseId: sourceId,
        stage: 'close',
        stageStartsAtTickTime: engine.tickTime,
        stageEndsAtTickTime: engine.tickTime + stageSeconds(def, 'close'),
        fromX: unit.x,
        fromY: unit.y,
        toX: to.x,
        toY: to.y,
        ...(def.eruption ? { eruptionRadiusPx: def.eruption.radiusPx } : {}),
    };
    claimUnit(unit, state.burrow, def, engine);
    runCallback(def, 'close', unit, engine);
    advanceStages(unit, state, def, engine); // zero-length stages
}

/** Drop a burrow in progress (a later phase's transition supersedes it). The unit stays where it is. */
export function cancelBurrow(unit: Unit, state: BurrowHolder): void {
    if (!state.burrow) return;
    state.burrow = null;
    releaseUnit(unit);
}

/** Once per tick: advance a phase's burrow (its def is looked up from the phase id). */
export function tickBurrow(unit: Unit, state: UnitPhaseState, engine: EngineContext): void {
    const b = state.burrow;
    if (!b) return;
    const def = findBurrowDef(unit, b.phaseId);
    if (!def) {
        cancelBurrow(unit, state);
        return;
    }
    advanceBurrow(unit, state, def, engine);
}

/** Once per tick: advance stages, move the unit along the trail, keep it from acting. Clears `holder.burrow` on landing. */
export function advanceBurrow(unit: Unit, holder: BurrowHolder, def: BurrowTransitionDef, engine: EngineContext): void {
    if (!holder.burrow) return;
    advanceStages(unit, holder, def, engine);
    if (holder.burrow) claimUnit(unit, holder.burrow, def, engine);
}

function advanceStages(unit: Unit, state: BurrowHolder, def: BurrowTransitionDef, engine: EngineContext): void {
    for (;;) {
        const b = state.burrow;
        if (!b) return;
        if (b.stage === 'travel') applyTravelPosition(unit, b, engine.tickTime);
        if (engine.tickTime < b.stageEndsAtTickTime) return;

        const next = BURROW_STAGES[BURROW_STAGES.indexOf(b.stage) + 1];
        if (next === undefined) {
            unit.x = b.toX;
            unit.y = b.toY;
            landEruption(unit, def, engine);
            unit.clearMovement();
            state.burrow = null;
            releaseUnit(unit);
            return;
        }
        b.stage = next;
        b.stageStartsAtTickTime = b.stageEndsAtTickTime;
        b.stageEndsAtTickTime += stageSeconds(def, next);
        if (next === 'travel') {
            unit.x = b.fromX;
            unit.y = b.fromY;
        }
        runCallback(def, next, unit, engine);
        if (next === 'rise') openEruption(unit, b, def, engine);
    }
}

export const BURROW_ERUPTION_LABEL = 'burrow_eruption';

/** The rise begins: if the eruption is reactable, this tick is its reaction frame (the telegraph is the whole rise). */
function openEruption(unit: Unit, b: ActiveBurrow, def: BurrowTransitionDef, engine: EngineContext): void {
    const eruption = def.eruption;
    if (!eruption || eruption.reactable === false) return;
    requestReactionFrame(engine, {
        sourceUnitId: unit.id,
        area: { kind: 'circle', x: b.toX, y: b.toY, radius: eruption.radiusPx },
        label: eruption.label ?? BURROW_ERUPTION_LABEL,
    });
}

/** The rise completed: the burst lands on everything still inside the circle. */
function landEruption(unit: Unit, def: BurrowTransitionDef, engine: EngineContext): void {
    const eruption = def.eruption;
    if (!eruption) return;
    for (const target of [...engine.units]) {
        if (!target.isAlive() || !areEnemies(unit.teamId, target.teamId)) continue;
        if (Math.hypot(target.x - unit.x, target.y - unit.y) > eruption.radiusPx + target.radius) continue;
        target.takeDamage(eruption.damage, unit.id, engine.eventBus);
    }
    engine.addEffect(
        new Effect({ x: unit.x, y: unit.y, duration: 0.6, effectType: 'Pulse', effectData: { colors: [0xe9d5ff] } }),
    );
}

function stageProgress(b: ActiveBurrow, tickTime: number): number {
    const len = b.stageEndsAtTickTime - b.stageStartsAtTickTime;
    if (len <= 0) return 1;
    return Math.min(1, Math.max(0, (tickTime - b.stageStartsAtTickTime) / len));
}

function applyTravelPosition(unit: Unit, b: ActiveBurrow, tickTime: number): void {
    const t = stageProgress(b, tickTime);
    unit.x = b.fromX + (b.toX - b.fromX) * t;
    unit.y = b.fromY + (b.toY - b.fromY) * t;
}

/** `Unit.controlled` is not serialized, so it is re-asserted every tick while the (serialized) burrow lasts. */
function claimUnit(unit: Unit, b: ActiveBurrow, def: BurrowTransitionDef, engine: EngineContext): void {
    unit.controlled = true;
    unit.controlledUntilTime = engine.gameTime + Math.max(0, remainingSeconds(b, def, engine));
    unit.clearMovement();
}

function remainingSeconds(b: ActiveBurrow, def: BurrowTransitionDef, engine: EngineContext): number {
    let rest = b.stageEndsAtTickTime - engine.tickTime;
    for (const s of BURROW_STAGES.slice(BURROW_STAGES.indexOf(b.stage) + 1)) rest += stageSeconds(def, s);
    return rest;
}

function releaseUnit(unit: Unit): void {
    unit.controlled = false;
    unit.controlledUntilTime = null;
}

// ---------------------------------------------------------------------------
// Renderer read
// ---------------------------------------------------------------------------

export interface BurrowVisual {
    stage: BurrowStage;
    /** 0-1 within the current stage. */
    stageProgress: number;
    /** 0 = fully above ground, 1 = fully under (the ground mask cuts the sprite at `1 - depth`). */
    depth: number;
    /** The burrow trail: from where it sank to where it will rise. */
    trail: { fromX: number; fromY: number; toX: number; toY: number };
}

/** What the renderer needs to draw a burrowing unit, or null when it is not burrowing. */
export function getBurrowVisual(state: BurrowHolder | undefined, tickTime: number): BurrowVisual | null {
    const b = state?.burrow;
    if (!b) return null;
    const p = stageProgress(b, tickTime);
    const depth = b.stage === 'close' ? 0 : b.stage === 'sink' ? p : b.stage === 'travel' ? 1 : 1 - p;
    return {
        stage: b.stage,
        stageProgress: p,
        depth,
        trail: { fromX: b.fromX, fromY: b.fromY, toX: b.toX, toY: b.toY },
    };
}
