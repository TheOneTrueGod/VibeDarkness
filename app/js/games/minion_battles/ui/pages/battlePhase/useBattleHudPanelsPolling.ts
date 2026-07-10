import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { WorldModifierDef } from '../../../worldModifiers/types';
import type { NinjutsuUIState } from '../../../game/ninjutsu/NinjutsuManager';

export function useBattleHudPanelsPolling(
    sessionRef: RefObject<BattleSession | null>,
): { activeWorldModifiers: WorldModifierDef[]; ninjutsuPools: NinjutsuUIState[] | null } {
    const [activeWorldModifiers, setActiveWorldModifiers] = useState<WorldModifierDef[]>([]);
    const [ninjutsuPools, setNinjutsuPools] = useState<NinjutsuUIState[] | null>(null);

    useEffect(() => {
        const id = window.setInterval(() => {
            const eng = sessionRef.current?.getEngine();
            setActiveWorldModifiers(eng ? eng.getActiveWorldModifiersForUI() : []);
            setNinjutsuPools(eng ? eng.getNinjutsuPoolState() : null);
        }, 500);
        return () => window.clearInterval(id);
    }, [sessionRef]);

    return { activeWorldModifiers, ninjutsuPools };
}
