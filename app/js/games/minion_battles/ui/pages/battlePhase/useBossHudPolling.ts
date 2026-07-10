import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { GameEngine } from '../../../game/GameEngine';
import type { BossHudSlice } from '../../components/boss/BossFightHud';
import { getBossSpecialMoveCharges } from '../../components/boss/bossSignatureHud';
import { getEffectiveHardCcThreshold } from '../../../crowdControl/ccArmourState';
import { UnitTag } from '../../../game/units/unitTag';

function buildBossHudSlice(engine: GameEngine): BossHudSlice {
    const bosses = engine.units.filter((u) => u.isAlive() && u.tags.includes(UnitTag.Boss));
    const b = bosses[0];
    if (!b) {
        return null;
    }
    const exposedBuff = b.buffs.find((buf) => buf._type === 'exposed');
    const exposedSecondsRemaining =
        exposedBuff && exposedBuff.duration.unit === 'seconds'
            ? Math.max(0, exposedBuff.appliedAtTime + exposedBuff.duration.value - engine.gameTime)
            : null;
    const exposedTotalDuration =
        exposedBuff?.duration.unit === 'seconds' ? exposedBuff.duration.value : null;
    return {
        name: b.name,
        hp: b.hp,
        maxHp: b.maxHp,
        hpInjury: b.hpInjury,
        effectiveHardCcThreshold: getEffectiveHardCcThreshold(b),
        hardCcArmourConsumed: b.ccArmour.hardConsumed,
        hardCcArmourEventSerial: b.ccArmour.eventSerial,
        lastHardCcEventKind: b.ccArmour.lastEventKind,
        specialMoveCharges: getBossSpecialMoveCharges(b),
        exposedSecondsRemaining,
        exposedTotalDuration,
        isEnraged: b.tags.includes(UnitTag.Enraged),
        characterId: b.characterId,
    };
}

function bossHudSlicesEqual(prev: BossHudSlice, next: BossHudSlice): boolean {
    if (prev == null || next == null) {
        return prev === next;
    }
    const smPrev = prev.specialMoveCharges;
    const smNext = next.specialMoveCharges;
    const smEqual =
        (smPrev == null && smNext == null) ||
        (smPrev != null &&
            smNext != null &&
            smPrev.filled === smNext.filled &&
            smPrev.total === smNext.total &&
            smPrev.abilityName === smNext.abilityName);

    return (
        prev.name === next.name &&
        prev.hp === next.hp &&
        prev.maxHp === next.maxHp &&
        prev.hpInjury === next.hpInjury &&
        prev.effectiveHardCcThreshold === next.effectiveHardCcThreshold &&
        prev.hardCcArmourConsumed === next.hardCcArmourConsumed &&
        prev.hardCcArmourEventSerial === next.hardCcArmourEventSerial &&
        prev.lastHardCcEventKind === next.lastHardCcEventKind &&
        Math.round((prev.exposedSecondsRemaining ?? -1) * 10) ===
            Math.round((next.exposedSecondsRemaining ?? -1) * 10) &&
        prev.exposedTotalDuration === next.exposedTotalDuration &&
        prev.isEnraged === next.isEnraged &&
        prev.characterId === next.characterId &&
        smEqual
    );
}

/** 100 ms poll of boss HUD slice from the live engine. */
export function useBossHudPolling(sessionRef: RefObject<BattleSession | null>) {
    const [bossHud, setBossHud] = useState<BossHudSlice>(null);

    useEffect(() => {
        const tick = () => {
            const eng = sessionRef.current?.getEngine();
            if (!eng) {
                setBossHud(null);
                return;
            }
            const next = buildBossHudSlice(eng);
            setBossHud((prev) => (bossHudSlicesEqual(prev, next) ? prev : next));
        };
        tick();
        const id = window.setInterval(tick, 100);
        return () => window.clearInterval(id);
    }, [sessionRef]);

    return { bossHud };
}
