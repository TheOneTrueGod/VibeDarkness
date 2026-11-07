/**
 * Battle tutorials for the local player: picks the tutorial to show from their account knowledge, advances
 * its steps on button clicks or local orders, and records progress on the account. UI only; see
 * `tutorials/AGENTS.md`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountKnowledgeMap, TutorialProgress } from '../../../../../accountKnowledge';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { BattleSessionEvent } from '../../../game/BattleSession';
import type { Camera } from '../../../game/Camera';
import type { GameEngine } from '../../../game/GameEngine';
import { TUTORIALS } from '../../../storylines/tutorialRegistry';
import { tutorialUnitsOnScreen } from '../../../tutorials/tutorialUnits';
import {
    findTriggeredTutorial,
    progressAfterStep,
    stepAdvancedBy,
    type ActiveTutorial,
} from '../../../tutorials/tutorialLogic';
import type { TutorialDef } from '../../../tutorials/tutorialTypes';

interface UseBattleTutorialParams {
    api: MinionBattlesApi;
    missionId: string;
    engine: GameEngine | null;
    /** Battle camera; `unitOnScreen` triggers only see units inside its viewport. */
    camera: Camera | null;
    knowledge: AccountKnowledgeMap;
    /** Reload the account after progress is saved, so knowledge stays current. */
    refetchUser?: () => Promise<void>;
    /** True while the player can act (their turn, battle intro out of the way). Tutorials start and show only then. */
    ready: boolean;
}

export interface BattleTutorialState {
    /** Tutorial and step to show now (null when none, or while not `ready`). */
    active: ActiveTutorial | null;
    next: () => void;
    skip: () => void;
    /** Feed every BattleSession event here. */
    onSessionEvent: (ev: BattleSessionEvent) => void;
}

export function useBattleTutorial({
    api,
    missionId,
    engine,
    camera,
    knowledge,
    refetchUser,
    ready,
}: UseBattleTutorialParams): BattleTutorialState {
    const [active, setActive] = useState<ActiveTutorial | null>(null);
    const activeRef = useRef<ActiveTutorial | null>(null);
    /** Tutorials already shown in this battle mount; never shown again here even before the account reloads. */
    const shownRef = useRef<Set<string>>(new Set());

    // Whenever the player can act and no tutorial is up, start the first one whose trigger matches.
    useEffect(() => {
        if (!ready || !engine || activeRef.current) return;
        const found = findTriggeredTutorial(
            TUTORIALS,
            knowledge,
            {
                missionId,
                gameTimeSeconds: engine.gameTime,
                unitsOnScreen: camera ? tutorialUnitsOnScreen(engine, camera) : [],
            },
            shownRef.current,
        );
        if (!found) return;
        shownRef.current.add(found.def.id);
        activeRef.current = found;
        setActive(found);
    }, [ready, engine, camera, knowledge, missionId]);

    const save = useCallback(
        (def: TutorialDef, progress: TutorialProgress) => {
            api.recordTutorialProgress({ key: def.knowledgeKey, tutorialId: def.id, ...progress })
                .then(() => refetchUser?.())
                .catch((err: unknown) => console.warn('[tutorial] failed to save progress', err));
        },
        [api, refetchUser],
    );

    const setCurrent = useCallback((value: ActiveTutorial | null) => {
        activeRef.current = value;
        setActive(value);
    }, []);

    const next = useCallback(() => {
        const current = activeRef.current;
        if (!current) return;
        const progress = progressAfterStep(current.def, current.step);
        save(current.def, progress);
        setCurrent(progress.done ? null : { def: current.def, step: progress.step });
    }, [save, setCurrent]);

    const skip = useCallback(() => {
        const current = activeRef.current;
        if (!current) return;
        save(current.def, { step: current.step, done: true });
        setCurrent(null);
    }, [save, setCurrent]);

    const onSessionEvent = useCallback(
        (ev: BattleSessionEvent) => {
            if (ev.type !== 'local_order_submitted') return;
            const current = activeRef.current;
            const step = current?.def.steps[current.step];
            if (!step) return;
            const order = ev.order;
            const hasMove = (order.movePath?.length ?? 0) > 0 || order.moveTargetUnitId != null;
            if (stepAdvancedBy(step, { type: 'localOrder', abilityId: order.abilityId, hasMove })) {
                next();
            }
        },
        [next],
    );

    return { active: ready ? active : null, next, skip, onSessionEvent };
}
