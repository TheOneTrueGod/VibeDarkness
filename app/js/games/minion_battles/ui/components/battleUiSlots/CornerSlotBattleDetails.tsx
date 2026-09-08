/**
 * CornerSlotBattleDetails — top-right canvas rack for misc battle details:
 * world modifiers, admin ninjutsu pools, and the debug game-tick pill.
 */
import React, { useSyncExternalStore } from 'react';
import type { WorldModifierDef } from '../../../worldModifiers/types';
import type { NinjutsuUIState } from '../../../game/ninjutsu/NinjutsuManager';
import { useCurrentUser } from '../../../../../user/useCurrentUser';
import { useDebugConsole } from '../../../../../contexts/DebugConsoleContext';
import { getShowGameTick, subscribeShowGameTick } from '../../../../../debugFlags';
import { TestIds } from '../../../../../testing/testIds';
import WorldModifiersPanel, { hasVisibleWorldModifierHud } from '../WorldModifiersPanel';
import GameTickPill, { type ItsPlayaheadTicks } from '../GameTickPill';

interface CornerSlotBattleDetailsProps {
    modifiers: WorldModifierDef[];
    ninjutsuPools?: NinjutsuUIState[] | null;
    getItsTicks?: () => ItsPlayaheadTicks | null;
}

export default function CornerSlotBattleDetails({
    modifiers,
    ninjutsuPools,
    getItsTicks,
}: CornerSlotBattleDetailsProps) {
    const { isAdmin } = useCurrentUser();
    const { debugConsoleEnabled } = useDebugConsole();
    const showGameTickFlag = useSyncExternalStore(subscribeShowGameTick, getShowGameTick, getShowGameTick);
    const showGameTick = showGameTickFlag && (isAdmin || debugConsoleEnabled);
    const showModifiers = hasVisibleWorldModifierHud(modifiers, ninjutsuPools, isAdmin);
    if (!showModifiers && !showGameTick) return null;

    return (
        <div
            className="pointer-events-auto absolute right-2 top-2 z-20 flex max-w-[min(16rem,calc(100%-1rem))] flex-col items-stretch gap-1.5 rounded-lg border border-border-custom bg-dark-900/80 p-1.5"
            data-testid={TestIds.battleDetails}
            aria-label="Battle details"
        >
            {showModifiers ? (
                <WorldModifiersPanel modifiers={modifiers} ninjutsuPools={ninjutsuPools} />
            ) : null}
            {showGameTick ? <GameTickPill getItsTicks={getItsTicks} /> : null}
        </div>
    );
}
