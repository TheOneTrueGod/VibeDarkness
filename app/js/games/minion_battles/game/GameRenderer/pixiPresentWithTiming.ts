/**
 * Instrumented Pixi present: times subsections of `Application.render()` which is
 * `renderer.render({ container: stage })` (see pixi `AbstractRenderer.render`).
 *
 * Child timings map to Pixi's SystemRunner phases after transform/prepare:
 * prerender → renderStart → webgl (`runners.render`) → renderEnd → postrender.
 * Exclusive time on `pixiPresent` itself is mostly options/transform setup before those runners.
 */
import type { Application } from 'pixi.js';
import {
    PERF_PIXI_POSTRENDER,
    PERF_PIXI_PRERENDER,
    PERF_PIXI_RENDER_END,
    PERF_PIXI_RENDER_START,
    PERF_PIXI_WEBGL,
    PERF_UI_CANVAS_PIXI_PRESENT,
    tickPerformanceTracker,
} from '../performance/tickPerformanceTracker';

type RunnerEmit = (...args: unknown[]) => void;

interface RendererWithRunners {
    runners: Record<string, { emit: RunnerEmit }>;
}

const PIXI_RUNNER_PERF: ReadonlyArray<{ runner: string; perf: string }> = [
    { runner: 'prerender', perf: PERF_PIXI_PRERENDER },
    { runner: 'renderStart', perf: PERF_PIXI_RENDER_START },
    { runner: 'render', perf: PERF_PIXI_WEBGL },
    { runner: 'renderEnd', perf: PERF_PIXI_RENDER_END },
    { runner: 'postrender', perf: PERF_PIXI_POSTRENDER },
];

/**
 * Flush the Pixi stage to the canvas. When JS performance tracking is off, identical to `app.render()`.
 */
export function presentPixiApplicationWithTiming(app: Application): void {
    if (!tickPerformanceTracker.isEnabled()) {
        app.render();
        return;
    }

    tickPerformanceTracker.measure([PERF_UI_CANVAS_PIXI_PRESENT], () => {
        const renderer = app.renderer as unknown as RendererWithRunners;
        const originals = new Map<string, RunnerEmit>();

        for (const { runner: runnerKey, perf } of PIXI_RUNNER_PERF) {
            const runner = renderer.runners[runnerKey];
            if (!runner) continue;
            const original = runner.emit.bind(runner) as RunnerEmit;
            originals.set(runnerKey, original);
            runner.emit = (...args: unknown[]) =>
                tickPerformanceTracker.measure([perf], () => original(...args));
        }

        try {
            app.render();
        } finally {
            for (const [runnerKey, original] of originals) {
                const runner = renderer.runners[runnerKey];
                if (runner) runner.emit = original;
            }
        }
    });
}
