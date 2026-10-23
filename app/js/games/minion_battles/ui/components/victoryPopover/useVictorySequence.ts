import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    buildVictoryTimeline,
    type VictoryStage,
    type VictoryTimelineEntry,
    type VictoryTimelineOptions,
} from './victorySequence';

export interface UseVictorySequenceResult {
    stage: VictoryStage;
    timeline: VictoryTimelineEntry[];
    /** Duration (ms) of a stage on the current timeline (0 when skipped or reduced motion). */
    stageDurationMs: (stage: VictoryStage) => number;
    /** Jump straight to the final state. */
    skip: () => void;
}

/**
 * Advances the victory stages with timers. The sequence holds at the end of `title` until `resultsReady`
 * (the async persist / quest-plan work), so the conversion and rewards never show half-loaded.
 */
export function useVictorySequence(
    options: VictoryTimelineOptions,
    resultsReady: boolean,
): UseVictorySequenceResult {
    const { hasObjectives, hasConversion, speedMultiplier, reducedMotion } = options;
    const timeline = useMemo(
        () => buildVictoryTimeline({ hasObjectives, hasConversion, speedMultiplier, reducedMotion }),
        [hasObjectives, hasConversion, speedMultiplier, reducedMotion],
    );
    const [stage, setStage] = useState<VictoryStage>(() => (reducedMotion ? 'done' : (timeline[0]?.stage ?? 'done')));
    const stageStartedAtRef = useRef(performance.now());

    useEffect(() => {
        if (stage === 'done') return undefined;
        const index = timeline.findIndex((e) => e.stage === stage);
        if (index < 0) {
            setStage('done');
            return undefined;
        }
        if (stage === 'title' && !resultsReady) return undefined;
        const elapsed = performance.now() - stageStartedAtRef.current;
        const remaining = Math.max(0, timeline[index].durationMs - elapsed);
        const id = setTimeout(() => {
            stageStartedAtRef.current = performance.now();
            setStage(timeline[index + 1]?.stage ?? 'done');
        }, remaining);
        return () => clearTimeout(id);
    }, [stage, timeline, resultsReady]);

    const skip = useCallback(() => setStage('done'), []);
    const stageDurationMs = useCallback(
        (s: VictoryStage) => timeline.find((e) => e.stage === s)?.durationMs ?? 0,
        [timeline],
    );

    return { stage, timeline, stageDurationMs, skip };
}
