import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession, BattleSessionEvent } from '../../../game/BattleSession';
import type { GameEngine } from '../../../game/GameEngine';
import type { OrderWaiter, WaitingForOrders } from '../../../game/types';
import { TeamworkTextEffect } from '../../../game/effect_defs/hudEffects';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';

interface UseBattleRoundStateParams {
    playerId: string;
    hudEffectCanvasRef: RefObject<HudEffectCanvasHandle | null>;
}

/** Round/pause/waiter/card UI state and non-rewind BattleSession event dispatch. */
export function useBattleRoundState({ playerId, hudEffectCanvasRef }: UseBattleRoundStateParams) {
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundProgress, setRoundProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [waitingForOrders, setWaitingForOrders] = useState<WaitingForOrders | null>(null);
    const [activeLocalWaiter, setActiveLocalWaiter] = useState<OrderWaiter | null>(null);
    const [myAbilityIds, setMyAbilityIds] = useState<string[]>([]);
    const [storyPauseActive, setStoryPauseActive] = useState(false);
    const [orderSubmitFailed, setOrderSubmitFailed] = useState(false);

    const updateCardStateRef = useRef<((engine: GameEngine) => void) | null>(null);

    function updateCardState(engine: GameEngine) {
        const active = engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId);
        const unit = active ? engine.getUnit(active.unitId) : engine.getLocalPlayerUnit();
        setMyAbilityIds([...(unit?.abilities ?? [])]);
    }
    updateCardStateRef.current = updateCardState;

    const handleWaitingForOrdersState = useCallback(
        (engine: GameEngine, info: WaitingForOrders, _source: 'engine_callback' | 'post_full_state_sync') => {
            setWaitingForOrders(info);
            setIsPaused(true);
            setStoryPauseActive(engine.storyPauseActive);

            if (info.teamworkCancelledOwnerIds?.includes(playerId)) {
                hudEffectCanvasRef.current?.addHudEffect(new TeamworkTextEffect());
            }

            const active = engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId);
            setActiveLocalWaiter(active);

            updateCardStateRef.current?.(engine);
        },
        [playerId, hudEffectCanvasRef],
    );

    const handleSessionEvent = useCallback(
        (ev: BattleSessionEvent, session: BattleSession) => {
            if (ev.type === 'waiting_for_orders') {
                handleWaitingForOrdersState(ev.engine, ev.info, ev.source);
            }
            if (ev.type === 'pause_state') {
                setWaitingForOrders(ev.waitingForOrders);
                setIsPaused(ev.paused);
                const eng = session.getEngine();
                setActiveLocalWaiter(eng?.state.orderMgr.getActiveOrderWaiterForPlayer(playerId) ?? null);
                setStoryPauseActive(eng?.storyPauseActive ?? false);
            }
            if (ev.type === 'round_number') {
                setRoundNumber(ev.roundNumber);
            }
            if (ev.type === 'round_progress') {
                setRoundProgress(ev.progress);
            }
            if (ev.type === 'card_state') {
                updateCardState(ev.engine);
                setActiveLocalWaiter(ev.engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId));
                setStoryPauseActive(ev.engine.storyPauseActive);
            }
            if (ev.type === 'order_submit_failed') {
                setOrderSubmitFailed(true);
            }
        },
        [playerId, handleWaitingForOrdersState],
    );

    return {
        roundNumber,
        roundProgress,
        isPaused,
        waitingForOrders,
        activeLocalWaiter,
        myAbilityIds,
        storyPauseActive,
        orderSubmitFailed,
        setOrderSubmitFailed,
        handleSessionEvent,
    };
}
