import type { GameEngine } from '../../game/GameEngine';
import type { ScenarioDefinition } from '../types';

const FIXED_STEP_SEC = 1 / 60;

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
        engine.applyOrder(order);
    }

    let ticks = 0;
    let settled = false;

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
                if (scenario.assertPass(engine)) {
                    markSettled();
                    return;
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
                engine.stepSimulationFixedTicks(1);
                ticks++;
            }
            if (
                ticks >= maxTicks ||
                scenario.assertPass(engine) ||
                engine.state.levelEventManager.isTerminal ||
                engine.isScenarioRunnerBattleIdle()
            ) {
                markSettled();
            }
        },
        getResult(): ScenarioRunResult {
            const passed = scenario.assertPass(engine);
            const msg = passed
                ? 'ok'
                : scenario.failureMessage(engine) + (scenario.describeState ? ` | ${scenario.describeState(engine)}` : '');
            return { passed, message: msg, ticks };
        },
    };
}

/**
 * Build a scenario engine, apply initial orders, then step fixed ticks until `assertPass` or timeout.
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
            engine.applyOrder(order);
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
