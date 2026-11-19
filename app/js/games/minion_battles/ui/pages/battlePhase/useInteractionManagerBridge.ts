import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { BattleOrder, WaitingForOrders } from '../../../game/types';
import type { AbilityBarChangedEvent } from '../../../game/EventBus';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { isPreferredModeBlocked } from '../../../abilities/resolveAbilityMode';

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
        mgr.setMyAbilityIds(myAbilityIds);
        // The mode the player picked on the strip, or undefined: the manager then follows the
        // default mode (or its fallback while the default can't be cast) via `resolveSlotMode`.
        mgr.setAbilityModeResolver((abilityId) => abilityModeByAbilityIdRef.current[abilityId]);
        // Last: a new pause plane can auto-continue a Combo, which needs the hand and mode set above.
        mgr.setWaitingForOrders(waitingForOrders);
    }, [canUseOrderUi, waitingForOrders, myAbilityIds, battleInitPhase, abilityModeByAbilityId, sessionRef]);

    // A Create card's replacement starts on its first mode, even if that card was toggled earlier.
    useEffect(() => {
        if (battleInitPhase !== 'ready') return;
        const engine = sessionRef.current?.engine;
        if (!engine) return;
        const onBar = (event: AbilityBarChangedEvent) => {
            const abilityId = event.defaultModeAbilityId;
            if (!abilityId) return;
            const prev = abilityModeByAbilityIdRef.current;
            if (prev[abilityId] !== undefined) {
                const next = { ...prev };
                delete next[abilityId];
                abilityModeByAbilityIdRef.current = next;
                setAbilityModeByAbilityId(next);
            }
            sessionRef.current?.getInteractionManager()?.refreshNonconfirmedAbilityMode(abilityId);
        };
        engine.eventBus.on('ability_bar_changed', onBar);
        return () => engine.eventBus.off('ability_bar_changed', onBar);
    }, [battleInitPhase, sessionRef]);

    // Auto-upgrade: a slot toggled to its fallback tier (Bloody Claws) moves back up to the preferred tier
    // (Ice Claws) the moment that tier becomes castable again (e.g. Water recovered). Only the
    // blocked -> castable transition triggers it, so a deliberate pick while both are castable sticks.
    useEffect(() => {
        if (battleInitPhase !== 'ready') return;
        const blockedBefore: Record<string, boolean> = {};
        const check = () => {
            const session = sessionRef.current;
            const unit = session?.engine?.getLocalPlayerUnit();
            if (!session || !unit) return;
            for (const abilityId of unit.abilities) {
                const slotAbility = getAbility(abilityId);
                if (!slotAbility?.abilityModes?.fallbackMode) continue;
                const blocked = isPreferredModeBlocked(unit, slotAbility);
                const wasBlocked = blockedBefore[abilityId] ?? blocked;
                blockedBefore[abilityId] = blocked;
                const config = slotAbility.abilityModes;
                const picked = abilityModeByAbilityIdRef.current[abilityId];
                if (!wasBlocked || blocked || picked === undefined || picked === config.defaultMode) continue;
                const next = { ...abilityModeByAbilityIdRef.current };
                delete next[abilityId];
                abilityModeByAbilityIdRef.current = next;
                setAbilityModeByAbilityId(next);
                session.getInteractionManager()?.refreshNonconfirmedAbilityMode(abilityId);
            }
        };
        const handle = window.setInterval(check, 150);
        return () => window.clearInterval(handle);
    }, [battleInitPhase, sessionRef]);

    // Keydown: delegate to manager.onKeyDown.
    useEffect(() => {
        if (battleInitPhase !== 'ready') return;
        const onKeyDown = (e: KeyboardEvent) => {
            sessionRef.current?.getInteractionManager()?.onKeyDown(e);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [battleInitPhase, sessionRef]);

    const handleSetAbilityMode = (abilityId: string, mode: string) => {
        setAbilityModeByAbilityId((prev) => {
            if (prev[abilityId] === mode) return prev;
            return { ...prev, [abilityId]: mode };
        });
        sessionRef.current?.getInteractionManager()?.refreshNonconfirmedAbilityMode(abilityId);
    };

    return {
        selectedCardIndex,
        selectedAbility,
        nonconfirmedOrder,
        abilityModeByAbilityId,
        handleSetAbilityMode,
    };
}
