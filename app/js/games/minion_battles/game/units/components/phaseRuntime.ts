/**
 * Unit phase runtime: condition evaluator and the "enter a phase" routine. Data lives in `phaseDef.ts`, serialized
 * state in `phaseComponent.ts`.
 *
 * Entry points (both call `evaluateUnitPhases`):
 *  - `UnitManager`, right after a `damage_taken` event (where enrage was checked before phases existed);
 *  - the `phase` component's `tick` hook, once per simulation tick in the nest phase (after units, projectiles and
 *    effects; before cleanup), for conditions that change without damage (time, adds dead, counters).
 *
 * Rules:
 *  - One-way. A phase is entered once; `state.index` only grows. Healing never reverts a phase.
 *  - If one evaluation satisfies several consecutive phases (a hit crosses two thresholds), every phase it passes
 *    is entered, in list order, in the same call, so no `onEnter` is skipped. A later phase's transition replaces
 *    an earlier one's (the earlier invulnerability tag is released first).
 *  - Entering is deterministic (no RNG, world/tick time only) and the engine paths it uses (Time Stop, story
 *    pause, tags, buffs) are all serialized, so ITS previews and committed runs behave identically.
 *  - Old checkpoints: a unit that already carries a phase's `tags.add` tags (an enraged wolf from before phases
 *    existed, or a spawn pre-tagged by a test or mission) is treated as having entered that phase already, silently
 *    (no effects, no event). Phases that add no tags cannot be recognised this way; they have no legacy state.
 */

import type { EngineContext } from '../../EngineContext';
import type { Unit } from '../Unit';
import { UnitTag, addUnitTag, hasUnitTag, removeUnitTag } from '../unitTag';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { TimeDilationBuff, applyTimeDilationBuff } from '../../../buffs/TimeDilationBuff';
import { getUnitAITree, isNodeInTree, setCurrentNodeId } from '../unitAI';
import type { PhaseCondition, UnitPhaseDef } from './phaseDef';
import { peekPhaseState, phasesOf, type UnitPhaseState } from './phaseComponent';

/** Phase modifier buffs never expire (world seconds; JSON-safe, unlike Infinity). */
const PERMANENT_BUFF_SECONDS = 1e9;

/** Source id of the tempo buff a phase applies (one per phase id). */
export function phaseModifierSourceId(phaseId: string): string {
    return `phase:${phaseId}`;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** `damage`: right after a damage event (HP read live). `tick`: once per tick (HP read from the latched value). */
export type PhaseCheckTrigger = 'damage' | 'tick';

export function evaluatePhaseCondition(
    cond: PhaseCondition,
    unit: Unit,
    state: UnitPhaseState,
    engine: EngineContext,
    trigger: PhaseCheckTrigger = 'tick',
): boolean {
    switch (cond.kind) {
        case 'health_below_percent':
            if (trigger === 'tick') return state.hpFractionAtDamage <= cond.threshold;
            return unit.maxHp > 0 && unit.hp / unit.maxHp <= cond.threshold;
        case 'elapsed_seconds': {
            const since = cond.from === 'previousPhase' ? (state.enteredAtGameTime ?? 0) : 0;
            return engine.gameTime - since >= cond.seconds;
        }
        case 'units_alive_below': {
            let alive = 0;
            for (const u of engine.units) {
                if (u.id === unit.id || !u.isAlive()) continue;
                if (cond.characterId !== undefined && u.characterId !== cond.characterId) continue;
                if (cond.teamId !== undefined && u.teamId !== cond.teamId) continue;
                alive++;
            }
            return alive < cond.count;
        }
        case 'counter_at_least':
            return engine.worldModifierManager.getCounter(cond.modifierId, cond.counterId) >= cond.count;
        case 'all':
            return cond.conditions.length > 0 && cond.conditions.every((c) => evaluatePhaseCondition(c, unit, state, engine, trigger));
        case 'any':
            return cond.conditions.some((c) => evaluatePhaseCondition(c, unit, state, engine, trigger));
    }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Enter every phase whose condition now holds, in order. No-op for dead units and units without phases. */
export function evaluateUnitPhases(unit: Unit, engine: EngineContext, trigger: PhaseCheckTrigger = 'tick'): void {
    const state = peekPhaseState(unit);
    if (!state || !unit.isAlive()) return;
    if (trigger === 'damage' && unit.maxHp > 0) {
        state.hpFractionAtDamage = Math.min(state.hpFractionAtDamage, unit.hp / unit.maxHp);
    }
    const phases = phasesOf(unit);
    while (state.index < phases.length && unit.isAlive()) {
        const phase = phases[state.index]!;
        if (phaseAlreadyApplied(unit, phase)) {
            state.index++; // legacy / pre-tagged: recognised from tags, nothing re-runs
            continue;
        }
        if (!evaluatePhaseCondition(phase.enterWhen, unit, state, engine, trigger)) break;
        enterPhase(unit, state, phase, engine);
    }
}

function phaseAlreadyApplied(unit: Unit, phase: UnitPhaseDef): boolean {
    const add = phase.tags?.add;
    return !!add && add.length > 0 && add.every((t) => hasUnitTag(unit, t));
}

// ---------------------------------------------------------------------------
// Entering a phase
// ---------------------------------------------------------------------------

function enterPhase(unit: Unit, state: UnitPhaseState, phase: UnitPhaseDef, engine: EngineContext): void {
    const phaseIndex = state.index;
    // Advance first: anything the entry triggers (damage events, spawned units) sees this phase as entered.
    state.index = phaseIndex + 1;
    state.enteredAtGameTime = engine.gameTime;

    // 1. Tags (every requiredTags / forbiddenTags gate keeps working off these).
    const tagsAdded: UnitTag[] = [];
    for (const tag of phase.tags?.add ?? []) {
        if (!hasUnitTag(unit, tag)) {
            addUnitTag(unit, tag);
            tagsAdded.push(tag);
        }
    }
    for (const tag of phase.tags?.remove ?? []) removeUnitTag(unit, tag);
    if (tagsAdded.includes(UnitTag.Enraged)) {
        engine.eventBus.emit('unit_enraged', { unitId: unit.id, tag: UnitTag.Enraged });
    }

    // 2. Explicit ability list changes.
    applyAbilityChanges(unit, phase);

    // 3. Modifiers.
    applyModifiers(unit, phase, engine);

    // 4. AI switch.
    applyAiSwitch(unit, phase);

    // 5. Transition.
    startTransition(unit, state, phase, engine);

    // 6. onEnter world effects (the phased unit is the effect's "victim" position).
    if (phase.onEnter?.length) engine.worldModifierManager.applyEffectsForUnit(phase.onEnter, unit);

    // 7. Event.
    engine.eventBus.emit('unit_phase_entered', {
        unitId: unit.id,
        phaseId: phase.id,
        phaseIndex,
        label: phase.label ?? null,
        tagsAdded,
    });
}

function applyAbilityChanges(unit: Unit, phase: UnitPhaseDef): void {
    const add = phase.abilities?.add ?? [];
    const remove = phase.abilities?.remove ?? [];
    for (const id of add) {
        if (!unit.abilities.includes(id)) unit.abilities = [...unit.abilities, id];
    }
    for (const id of remove) {
        unit.abilities = unit.abilities.filter((a) => a !== id);
        delete unit.abilityRuntime[id];
    }
    if (add.length > 0) initializeAbilityRuntimeForUnit(unit); // creates runtime state for new ids only
}

function applyModifiers(unit: Unit, phase: UnitPhaseDef, engine: EngineContext): void {
    const m = phase.modifiers;
    if (!m) return;
    if (m.tempo !== undefined) {
        applyTimeDilationBuff(
            unit,
            new TimeDilationBuff({
                sourceId: phaseModifierSourceId(phase.id),
                tempo: m.tempo,
                durationSeconds: PERMANENT_BUFF_SECONDS,
            }),
            engine.gameTime,
            engine.roundNumber,
            engine.eventBus,
        );
    }
    if (m.damageMultiplier !== undefined) {
        const current = unit.getDamageModifier();
        unit.combatSettings = {
            ...unit.combatSettings,
            damageModifier: { flatAmt: current.flatAmt, multiplier: current.multiplier * m.damageMultiplier },
        };
    }
}

function applyAiSwitch(unit: Unit, phase: UnitPhaseDef): void {
    const ai = phase.ai;
    if (!ai) return;
    const treeId = ai.treeId ?? unit.unitAITreeId;
    const tree = getUnitAITree(treeId);
    if (ai.node !== undefined && tree && !isNodeInTree(tree, ai.node)) {
        console.warn(`[phases] phase "${phase.id}": node "${ai.node}" is not in AI tree "${treeId}"`);
        return;
    }
    if (ai.treeId !== undefined) unit.unitAITreeId = ai.treeId;
    if (ai.node !== undefined) setCurrentNodeId(unit, ai.node);
    // Drop the cached goal so the new tree replans instead of finishing the old tree's plan.
    unit.tacticalPlan = null;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function startTransition(unit: Unit, state: UnitPhaseState, phase: UnitPhaseDef, engine: EngineContext): void {
    const t = phase.transition;
    if (!t) return;
    const duration = Math.max(0, t.durationSeconds ?? 0);
    const invulnerable = Math.max(0, t.invulnerableSeconds ?? 0);

    // A later phase's transition (several thresholds in one hit) supersedes the earlier one.
    clearTransition(unit, state);

    let timeStopId: string | null = null;
    if (t.kind === 'timeStop' && duration > 0) {
        timeStopId = engine.startTimeStop({ sourceActorId: unit.id, durationTickSeconds: duration }).id;
    } else if (t.kind === 'storyPause' && duration > 0) {
        engine.startStoryPause(`phase:${phase.id}`, duration);
    }

    let addedInvincibleTag = false;
    if (invulnerable > 0 && !hasUnitTag(unit, UnitTag.Invincible)) {
        addUnitTag(unit, UnitTag.Invincible);
        addedInvincibleTag = true;
    }

    const total = Math.max(duration, invulnerable);
    if (total <= 0) return;
    state.transition = {
        phaseId: phase.id,
        endsAtTickTime: engine.tickTime + total,
        invulnerableUntilTickTime: invulnerable > 0 ? engine.tickTime + invulnerable : null,
        addedInvincibleTag,
        timeStopId,
        banner: t.banner ?? null,
    };
}

/** Release the invulnerability a transition added and forget it. The engine ends Time Stops / story pauses itself. */
function clearTransition(unit: Unit, state: UnitPhaseState): void {
    const tr = state.transition;
    if (!tr) return;
    if (tr.addedInvincibleTag) removeUnitTag(unit, UnitTag.Invincible);
    state.transition = null;
}

/** Once per tick: end the invulnerability window and the transition when their tick-time deadlines pass. */
export function tickPhaseTransition(unit: Unit, state: UnitPhaseState, engine: EngineContext): void {
    const tr = state.transition;
    if (!tr) return;
    if (tr.invulnerableUntilTickTime != null && engine.tickTime >= tr.invulnerableUntilTickTime) {
        if (tr.addedInvincibleTag) removeUnitTag(unit, UnitTag.Invincible);
        tr.addedInvincibleTag = false;
        tr.invulnerableUntilTickTime = null;
    }
    if (engine.tickTime >= tr.endsAtTickTime) clearTransition(unit, state);
}
