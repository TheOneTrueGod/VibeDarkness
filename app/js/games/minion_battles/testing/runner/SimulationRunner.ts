import type { GameEngine } from '../../game/GameEngine';
import type { ScenarioDefinition } from '../types';

const FIXED_STEP_SEC = 1 / 60;

/** Headless scenarios: resolve a mid-cast conditional cancel pause (custom hook or auto-wait). */
function maybeAutoResolveConditionalCancel(
    engine: GameEngine,
    onConditionalCancelPause?: (engine: GameEngine) => void,
): void {
    const batch = engine.waitingForOrders;
    const cc = batch?.conditionalCancelContext;
    if (!batch || !cc) return;
    if (engine.state.orderMgr.hasPendingOrderForUnit(cc.unitId, batch.atTick)) return;
    if (onConditionalCancelPause) {
        onConditionalCancelPause(engine);
        return;
    }
    engine.state.orderMgr.applyOrder({ unitId: cc.unitId, abilityId: 'wait', targets: [] });
}

/** Extra frames to step after assertPass first returns true, so the animation plays out. */
const EXTRA_FRAMES_AFTER_PASS = 30;

export interface ScenarioRunResult {
    passed: boolean;
    message: string;
    ticks: number;
}

export interface LiveScenarioRun {
    readonly scenario: ScenarioDefinition;
    readonly engine: GameEngine;
    readonly maxTicks: number;
    getTicks(): number;
    isSettled(): boolean;
    dispose(): void;
    stepTicks(n: number): void;
    getResult(): ScenarioRunResult;
}

/**
 * Build engine, apply initial orders once, then step manually (for browser panes).
 * Does not auto-destroy — call {@link LiveScenarioRun.dispose}.
 */
export function createLiveScenarioRun(scenario: ScenarioDefinition): LiveScenarioRun {
    const maxMs = scenario.maxDurationMs ?? 5000;
    const maxTicks = Math.max(1, Math.ceil(maxMs / 1000 / FIXED_STEP_SEC));
    const built = scenario.buildEngine();
    if (built instanceof Promise) {
        throw new Error(`Scenario "${scenario.id}" returned a Promise from buildEngine`);
    }
    const engine = built;
    if (engine.state.levelEventManager.isTerminal) {
        throw new Error(`Scenario "${scenario.id}" started terminal`);
    }
    for (const order of scenario.getInitialOrders(engine)) {
        engine.state.orderMgr.applyOrder(order);
    }

    let ticks = 0;
    let settled = false;
    /** Tick at which assertPass first returned true; null until then. */
    let passedAtTick: number | null = null;

    const markSettled = (): void => {
        settled = true;
    };

    return {
        scenario,
        engine,
        maxTicks,
        getTicks: () => ticks,
        isSettled: () => settled,
        dispose() {
            engine.destroy();
        },
        stepTicks(n: number) {
            if (settled) return;
            const steps = Math.max(0, Math.floor(n));
            for (let i = 0; i < steps; i++) {
                if (settled) return;

                // After pass: keep stepping extra frames before settling.
                if (passedAtTick !== null) {
                    if (ticks >= passedAtTick + EXTRA_FRAMES_AFTER_PASS) {
                        markSettled();
                        return;
                    }
                    if (!engine.state.levelEventManager.isTerminal) {
                        engine.stepSimulationFixedTicks(1);
                    }
                    ticks++;
                    continue;
                }

                // Latch pass but keep going — extra frames will play before settling.
                if (scenario.assertPass(engine)) {
                    passedAtTick = ticks;
                    continue;
                }
                if (ticks >= maxTicks) {
                    markSettled();
                    return;
                }
                if (engine.state.levelEventManager.isTerminal) {
                    markSettled();
                    return;
                }
                if (engine.isScenarioRunnerBattleIdle()) {
                    markSettled();
                    return;
                }
                maybeAutoResolveConditionalCancel(engine, scenario.onConditionalCancelPause);
                engine.stepSimulationFixedTicks(1);
                ticks++;
            }

            // Post-loop settlement check (covers the case where stepTicks(1) is called repeatedly).
            if (passedAtTick !== null) {
                if (ticks >= passedAtTick + EXTRA_FRAMES_AFTER_PASS) {
                    markSettled();
                }
            } else if (scenario.assertPass(engine)) {
                passedAtTick = ticks;
            } else if (
                ticks >= maxTicks ||
                engine.state.levelEventManager.isTerminal ||
                engine.isScenarioRunnerBattleIdle()
            ) {
                markSettled();
            }
        },
        getResult(): ScenarioRunResult {
            // Use the latched flag so the result stays "passed" even after the extra frames.
            const passed = passedAtTick !== null || scenario.assertPass(engine);
            const msg = passed
                ? 'ok'
                : scenario.failureMessage(engine) + (scenario.describeState ? ` | ${scenario.describeState(engine)}` : '');
            return { passed, message: msg, ticks };
        },
    };
}

/**
 * Build a scenario engine, apply initial orders, then step fixed ticks until `assertPass` or timeout.
 * Note: extra frames after pass are intentionally NOT applied here — this runner is a pure validation
 * path and has no visual display. Extra frames are only meaningful in {@link createLiveScenarioRun}.
 */
export function runScenarioHeadless(scenario: ScenarioDefinition): ScenarioRunResult {
    const maxMs = scenario.maxDurationMs ?? 5000;
    const maxTicks = Math.max(1, Math.ceil(maxMs / 1000 / FIXED_STEP_SEC));
    let engine: GameEngine | null = null;
    let ticks = 0;

    try {
        const built = scenario.buildEngine();
        if (built instanceof Promise) {
            throw new Error(`Scenario "${scenario.id}" returned a Promise; use a synchronous buildEngine for this runner.`);
        }
        engine = built;

        if (engine.state.levelEventManager.isTerminal) {
            return {
                passed: false,
                message: 'Engine started in terminal state',
                ticks: 0,
            };
        }

        for (const order of scenario.getInitialOrders(engine)) {
            engine.state.orderMgr.applyOrder(order);
        }

        while (ticks < maxTicks) {
            if (scenario.assertPass(engine)) {
                return { passed: true, message: 'ok', ticks };
            }
            if (engine.state.levelEventManager.isTerminal) {
                return {
                    passed: false,
                    message: 'Simulation became terminal (defeat/victory)',
                    ticks,
                };
            }
            if (engine.isScenarioRunnerBattleIdle()) {
                break;
            }
            maybeAutoResolveConditionalCancel(engine, scenario.onConditionalCancelPause);
            engine.stepSimulationFixedTicks(1);
            ticks++;
        }

        const msg = scenario.assertPass(engine)
            ? 'ok'
            : scenario.failureMessage(engine) + (scenario.describeState ? ` | ${scenario.describeState(engine)}` : '');
        return {
            passed: scenario.assertPass(engine),
            message: msg,
            ticks,
        };
    } finally {
        engine?.destroy();
    }
}
