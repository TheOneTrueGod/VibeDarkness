import React, { useEffect, useRef } from 'react';
import { BossArcadeHpBar, type BossArcadeHpBarProps } from './BossArcadeHpBar';
import { AlphaWolfHpBar } from './AlphaWolfHpBar';
import { BossCcArmourRow } from './BossCcArmourRow';
import { BossExposedTimerBar } from './BossExposedTimerBar';
import { BossSpecialMoveChargesBar } from './BossSpecialMoveCharges';
import type { BossSpecialMoveCharges } from './bossSignatureHud';

const BOSS_HP_BAR_REGISTRY: Readonly<Record<string, React.ComponentType<BossArcadeHpBarProps>>> = {
    alpha_wolf: AlphaWolfHpBar,
};

function getBossHpBar(characterId: string): React.ComponentType<BossArcadeHpBarProps> {
    return BOSS_HP_BAR_REGISTRY[characterId] ?? BossArcadeHpBar;
}

export type BossHudSlice = {
    name: string;
    hp: number;
    maxHp: number;
    hpInjury: number;
    effectiveHardCcThreshold: number;
    hardCcArmourConsumed: number;
    hardCcArmourEventSerial: number;
    lastHardCcEventKind: 'absorbed' | 'landed' | null;
    specialMoveCharges: BossSpecialMoveCharges | null;
    exposedSecondsRemaining: number | null;
    exposedTotalDuration: number | null;
    isEnraged: boolean;
    characterId: string;
} | null;

type BossFightHudProps = {
    boss: BossHudSlice;
    onRegisterCcStatusTarget?: (pageX: number, pageY: number) => void;
};

/**
 * Boss name inside HP bar, signature charges (when configured), CC pips; overlays the battle view.
 */
export default function BossFightHud({ boss, onRegisterCcStatusTarget }: BossFightHudProps) {
    const ccStatusRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!onRegisterCcStatusTarget || !ccStatusRef.current) return;
        const rect = ccStatusRef.current.getBoundingClientRect();
        onRegisterCcStatusTarget(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [boss, onRegisterCcStatusTarget]);

    if (!boss) return null;

    const HpBar = getBossHpBar(boss.characterId);

    return (
        <div
            className="pointer-events-none absolute left-1/2 top-2 z-30 w-[min(28rem,calc(100%-1rem))] -translate-x-1/2"
            role="region"
            aria-label="Boss fight"
        >
            <div className="px-2 pt-1 pb-4">
                <div className="relative w-full">
                    <HpBar name={boss.name} hp={boss.hp} maxHp={boss.maxHp} hpInjury={boss.hpInjury} isEnraged={boss.isEnraged} />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-[55%] flex-row items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 justify-start">
                            {boss.specialMoveCharges != null ? (
                                <BossSpecialMoveChargesBar
                                    filled={boss.specialMoveCharges.filled}
                                    total={boss.specialMoveCharges.total}
                                    abilityName={boss.specialMoveCharges.abilityName}
                                />
                            ) : null}
                        </div>
                        <div ref={ccStatusRef} className="flex shrink-0 justify-end">
                            {boss.exposedSecondsRemaining != null && boss.exposedTotalDuration != null ? (
                                <BossExposedTimerBar
                                    secondsRemaining={boss.exposedSecondsRemaining}
                                    totalDuration={boss.exposedTotalDuration}
                                />
                            ) : (
                                <BossCcArmourRow
                                    placement="overlay"
                                    effectiveHardCcThreshold={boss.effectiveHardCcThreshold}
                                    hardCcArmourConsumed={boss.hardCcArmourConsumed}
                                    hardCcArmourEventSerial={boss.hardCcArmourEventSerial}
                                    lastHardCcEventKind={boss.lastHardCcEventKind}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
