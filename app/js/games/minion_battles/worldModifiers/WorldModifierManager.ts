/**
 * WorldModifierManager — owns active world modifier instances, dispatches
 * declarative rules in response to EventBus events, and serializes instance
 * state into checkpoints.
 */

import type { EngineContext } from '../game/EngineContext';
import type { EventBus } from '../game/EventBus';
import type { WorldModifierDef, WorldEventType, SerializedWorldModifierInstance } from './types';
import type { WorldCondition } from './WorldCondition';
import type { WorldEffect } from './WorldEffect';
import type { WorldRuleEvalContext, WorldEventContext } from './WorldModifierRuntime';
import type { LightSource } from '../game/lightSources/LightSource';
import { evaluateCondition, applyEffect } from './WorldModifierRuntime';
import { type DispatchableRule, dispatchEventRules } from './EventRuleDispatcher';
import { registerBuiltinHandlers } from './builtinHandlers';

type CustomEffectHandler = (
    params: Record<string, unknown> | undefined,
    ctx: WorldRuleEvalContext,
    engine: EngineContext,
) => void;

// ---------------------------------------------------------------------------
// Runtime instance
// ---------------------------------------------------------------------------

interface WorldModifierInstance {
    def: WorldModifierDef;
    disabled: boolean;
    /** Game counters incremented by `incrementCounter` effects. */
    counters: Record<string, number>;
    /** Per-rule trigger counts for once / maxTriggers tracking (persisted in checkpoints). */
    ruleTriggerCounts: Record<string, number>;
    /** True when this modifier was added mid-battle (not in original mission defs). */
    isDynamic: boolean;
}

// ---------------------------------------------------------------------------
// WorldModifierManager
// ---------------------------------------------------------------------------

export class WorldModifierManager {
    private defs: WorldModifierDef[] = [];
    private instances = new Map<string, WorldModifierInstance>();
    private snapshotImport: SerializedWorldModifierInstance[] | null = null;
    private customEffectHandlers = new Map<string, CustomEffectHandler>();
    /** Non-serialized side map of world-modifier-spawned light sources for replace/max merge policy. */
    private readonly spawnedLightSources = new Map<string, { ls: LightSource; col: number; row: number }>();

    constructor(private readonly ctx: EngineContext) {
        registerBuiltinHandlers(this);
    }

    registerCustomEffectHandler(effectId: string, handler: CustomEffectHandler): void {
        this.customEffectHandlers.set(effectId, handler);
    }

    // -----------------------------------------------------------------------
    // Install / restore
    // -----------------------------------------------------------------------

    /**
     * Replace the active modifier set from a fresh def list.
     * If {@link importSnapshot} was called first, checkpoint state is merged;
     * otherwise instances are freshly constructed from def defaults.
     */
    install(defs: WorldModifierDef[]): void {
        this.defs = [...defs];
        this.instances.clear();

        const snap = this.snapshotImport;
        this.snapshotImport = null;

        for (const def of defs) {
            const s = snap?.find((si) => si.id === def.id);
            this.instances.set(def.id, s
                ? {
                    def,
                    disabled: s.disabled,
                    counters: { ...s.counters },
                    ruleTriggerCounts: { ...(s.ruleTriggerCounts ?? this.seedFromLegacy(s)) },
                    isDynamic: false,
                }
                : {
                    def,
                    disabled: def.startsDisabled ?? false,
                    counters: {},
                    ruleTriggerCounts: {},
                    isDynamic: false,
                });
        }

        // Dynamic modifiers (added mid-battle) have `dynamicDef` in the snapshot.
        for (const s of snap ?? []) {
            if (!s.dynamicDef || this.instances.has(s.id)) continue;
            const def = s.dynamicDef;
            this.instances.set(def.id, {
                def,
                disabled: s.disabled,
                counters: { ...s.counters },
                ruleTriggerCounts: { ...(s.ruleTriggerCounts ?? this.seedFromLegacy(s)) },
                isDynamic: true,
            });
            this.defs.push(def);
        }
    }

    /** Convert legacy `firedOnceRuleIds` to triggerCounts (count = 1 per fired id). */
    private seedFromLegacy(s: SerializedWorldModifierInstance): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const id of s.firedOnceRuleIds ?? []) {
            counts[id] = 1;
        }
        return counts;
    }

    // -----------------------------------------------------------------------
    // Activation check
    // -----------------------------------------------------------------------

    /**
     * Returns true when `def` is within its configured activation window
     * (round range + objective gate).  Does NOT check the `disabled` flag;
     * callers check that separately.
     */
    isModifierActive(def: WorldModifierDef, roundNumber: number): boolean {
        if (def.activeFromRound != null && roundNumber < def.activeFromRound) return false;
        if (def.activeUntilRound != null && roundNumber > def.activeUntilRound) return false;
        if (def.requiresObjectiveCompletedId != null) {
            if (!this.ctx.isObjectiveCompleted(def.requiresObjectiveCompletedId)) return false;
        }
        return true;
    }

    // -----------------------------------------------------------------------
    // EventBus listeners
    // -----------------------------------------------------------------------

    /**
     * Subscribe to unit_died and round_start on the provided EventBus.
     * Call this from GameEngine.registerCoreEventListeners() (Step 3).
     * round_end is handled via the explicit {@link handleRoundEnd} call.
     */
    registerListeners(eventBus: EventBus): void {
        eventBus.on('unit_died', (data) => {
            const victim = this.ctx.getUnit(data.unitId);
            if (!victim) return;
            this.dispatchForEvent('on_unit_died', {
                eventType: 'on_unit_died',
                unitId: data.unitId,
                killerUnitId: data.killerUnitId,
                victimCharacterId: victim.characterId,
                victimX: victim.x,
                victimY: victim.y,
                roundNumber: this.ctx.roundNumber,
            });
        });

        eventBus.on('round_start', (data) => {
            this.dispatchForEvent('on_round_start', {
                eventType: 'on_round_start',
                roundNumber: data.roundNumber,
            });
        });
    }

    /**
     * Dispatch on_round_end rules.  Called explicitly from
     * GameEngine.handleRoundEnd() (Step 3) so ordering matches other
     * round-end handlers.
     */
    handleRoundEnd(roundNumber: number): void {
        this.dispatchForEvent('on_round_end', {
            eventType: 'on_round_end',
            roundNumber,
        });
    }

    // -----------------------------------------------------------------------
    // Mid-battle API
    // -----------------------------------------------------------------------

    addModifier(def: WorldModifierDef): void {
        if (this.instances.has(def.id)) return;
        this.instances.set(def.id, {
            def,
            disabled: def.startsDisabled ?? false,
            counters: {},
            ruleTriggerCounts: {},
            isDynamic: true,
        });
        this.defs.push(def);
    }

    removeModifier(id: string): void {
        this.instances.delete(id);
        this.defs = this.defs.filter((d) => d.id !== id);
    }

    setDisabled(id: string, disabled: boolean): void {
        const inst = this.instances.get(id);
        if (inst) inst.disabled = disabled;
    }

    // -----------------------------------------------------------------------
    // UI query
    // -----------------------------------------------------------------------

    getActiveModifiersForUI(roundNumber: number): WorldModifierDef[] {
        const active: WorldModifierDef[] = [];
        for (const inst of this.instances.values()) {
            if (!inst.disabled && this.isModifierActive(inst.def, roundNumber)) {
                active.push(inst.def);
            }
        }
        return active;
    }

    // -----------------------------------------------------------------------
    // Serialization
    // -----------------------------------------------------------------------

    toJSON(): SerializedWorldModifierInstance[] {
        return [...this.instances.values()].map((inst) => ({
            id: inst.def.id,
            disabled: inst.disabled,
            counters: { ...inst.counters },
            ruleTriggerCounts: { ...inst.ruleTriggerCounts },
            ...(inst.isDynamic ? { dynamicDef: inst.def } : {}),
        }));
    }

    /**
     * Stash snapshot data; merged when {@link install} runs so that defs
     * (from mission) and state (from checkpoint) are set together, matching
     * the ObjectiveManager pattern.
     */
    importSnapshot(raw: unknown): void {
        if (!Array.isArray(raw)) {
            this.snapshotImport = null;
            return;
        }
        this.snapshotImport = raw as SerializedWorldModifierInstance[];
    }

    // -----------------------------------------------------------------------
    // Internal dispatch
    // -----------------------------------------------------------------------

    private dispatchForEvent(eventType: WorldEventType, rawCtx: WorldEventContext): void {
        const sortedInstances = [...this.instances.values()].sort(
            (a, b) => (b.def.priority ?? 0) - (a.def.priority ?? 0),
        );

        let stopAll = false;

        for (const inst of sortedInstances) {
            if (stopAll) break;
            if (!this.isModifierActive(inst.def, rawCtx.roundNumber)) continue;
            if (inst.disabled) continue;

            const rules = inst.def.rules?.[eventType];
            if (!rules?.length) continue;

            const normalized: DispatchableRule<WorldCondition, WorldEffect>[] = rules.map(
                (r, i) => ({
                    id: r.id ?? `${inst.def.id}_${eventType}_${i}`,
                    priority: r.priority,
                    maxTriggers: r.once ? 1 : (r.maxTriggers ?? Number.POSITIVE_INFINITY),
                    exclusive: r.exclusive,
                    conditions: r.conditions,
                    effects: r.effects,
                }),
            );

            const evalCtx: WorldRuleEvalContext = {
                event: rawCtx,
                counters: inst.counters,
                isObjectiveCompleted: (id) => this.ctx.isObjectiveCompleted(id),
            };

            const result = dispatchEventRules<WorldCondition, WorldEffect, WorldRuleEvalContext>(
                normalized,
                inst.ruleTriggerCounts,
                evalCtx,
                {
                    evaluateCondition: (cond, ctx) => evaluateCondition(cond, ctx),
                    applyEffect: (effect, ctx) => {
                        applyEffect(effect, ctx, this.ctx, {
                            onIncrementCounter: (counterId, amount) => {
                                inst.counters[counterId] = (inst.counters[counterId] ?? 0) + amount;
                            },
                            onAddModifier: (def) => this.addModifier(def),
                            onRemoveModifier: (id) => this.removeModifier(id),
                            onSetDisabled: (id, disabled) => this.setDisabled(id, disabled),
                            onCustomEffect: (effectId, params, ruleCtx) => {
                                const handler = this.customEffectHandlers.get(effectId);
                                if (handler) {
                                    handler(params, ruleCtx, this.ctx);
                                } else {
                                    console.warn(`[WorldModifierManager] no handler for custom effectId "${effectId}"`);
                                }
                            },
                            getSpawnedLightSourcesAtCell: (col, row) => {
                                const result: Array<{ id: string; ls: LightSource }> = [];
                                for (const [id, entry] of this.spawnedLightSources) {
                                    if (entry.col === col && entry.row === row) result.push({ id, ls: entry.ls });
                                }
                                return result;
                            },
                            onDeactivateSpawnedLightSource: (id) => {
                                this.spawnedLightSources.delete(id);
                            },
                            onRegisterSpawnedLightSource: (id, ls, col, row) => {
                                this.spawnedLightSources.set(id, { ls, col, row });
                            },
                        }, inst.def);
                    },
                },
            );

            if (result.wasExclusive) stopAll = true;
        }
    }
}
