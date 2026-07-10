import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { BattleOrder, WaitingForOrders } from '../../../game/types';
import { getAbility } from '../../../abilities/AbilityRegistry';

interface UseInteractionManagerBridgeParams {
    sessionRef: RefObject<BattleSession | null>;
    canUseOrderUi: boolean;
    waitingForOrders: WaitingForOrders | null;
    myAbilityIds: string[];
    battleInitPhase: 'fetching_assets' | 'loading_battle' | 'submitting' | 'ready';
}

/** Ability mode state, manager UI mirror, config push, and keydown delegation. */
export function useInteractionManagerBridge({
    sessionRef,
    canUseOrderUi,
    waitingForOrders,
    myAbilityIds,
    battleInitPhase,
}: UseInteractionManagerBridgeParams) {
    /** Mirror of manager UI state for AbilityBar rendering. */
    const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
    const [selectedAbility, setSelectedAbility] = useState<AbilityStatic | null>(null);
    const [nonconfirmedOrder, setNonconfirmedOrder] = useState<BattleOrder | null>(null);
    /** Per-ability cast mode (push/pull) — persists for the battle; written into submitted orders. */
    const [abilityModeByAbilityId, setAbilityModeByAbilityId] = useState<Record<string, string>>({});
    const abilityModeByAbilityIdRef = useRef<Record<string, string>>({});
    abilityModeByAbilityIdRef.current = abilityModeByAbilityId;

    // Manager subscription: mirror selectedAbility, selectedCardIndex, nonconfirmedOrder
    // into local React state for AbilityBar rendering.
    useEffect(() => {
        const manager = sessionRef.current?.getInteractionManager();
        if (!manager) return;
        const sync = () => {
            const s = manager.getUIState();
            setSelectedAbility(s.selectedAbility);
            setSelectedCardIndex(s.selectedCardIndex);
            setNonconfirmedOrder(s.nonconfirmedOrder);
        };
        sync();
        return manager.subscribe(sync);
    // Re-subscribe whenever battleInitPhase goes to 'ready' (manager is created in startEngine).
    }, [battleInitPhase, sessionRef]);

    // Push canUseOrderUi, waitingForOrders, and myAbilityIds into the manager.
    useEffect(() => {
        const mgr = sessionRef.current?.getInteractionManager();
        if (!mgr) return;
        mgr.setCanUseOrderUi(canUseOrderUi);
        mgr.setWaitingForOrders(waitingForOrders);
        mgr.setMyAbilityIds(myAbilityIds);
        mgr.setAbilityModeResolver((abilityId) => {
            const stored = abilityModeByAbilityIdRef.current[abilityId];
            if (stored !== undefined) return stored;
            return getAbility(abilityId)?.abilityModes?.defaultMode;
        });
    }, [canUseOrderUi, waitingForOrders, myAbilityIds, battleInitPhase, abilityModeByAbilityId, sessionRef]);

    // Keydown: delegate to manager.onKeyDown.
    useEffect(() => {
        if (battleInitPhase !== 'ready') return;
        const onKeyDown = (e: KeyboardEvent) => {
            sessionRef.current?.getInteractionManager()?.onKeyDown(e);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [battleInitPhase, sessionRef]);

    const handleCycleAbilityMode = (abilityId: string, modes: readonly string[]) => {
        setAbilityModeByAbilityId((prev) => {
            const current = prev[abilityId] ?? modes[0];
            const idx = modes.indexOf(current);
            const next = modes[(idx + 1) % modes.length]!;
            return { ...prev, [abilityId]: next };
        });
        sessionRef.current?.getInteractionManager()?.refreshNonconfirmedAbilityMode(abilityId);
    };

    return {
        selectedCardIndex,
        selectedAbility,
        nonconfirmedOrder,
        abilityModeByAbilityId,
        handleCycleAbilityMode,
    };
}
