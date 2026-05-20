import React from 'react';
import { BossArcadeHpBar } from './BossArcadeHpBar';
import { BossCcArmourRow } from './BossCcArmourRow';
import { BossExposedTimerBar } from './BossExposedTimerBar';
import { BossSpecialMoveChargesBar } from './BossSpecialMoveCharges';
import type { BossSpecialMoveCharges } from './bossSignatureHud';

export type BossHudSlice = {
    name: string;
    hp: number;
    maxHp: number;
    effectiveHardCcThreshold: number;
    hardCcArmourConsumed: number;
    hardCcArmourEventSerial: number;
    lastHardCcEventKind: 'absorbed' | 'landed' | null;
    specialMoveCharges: BossSpecialMoveCharges | null;
    exposedSecondsRemaining: number | null;
    exposedTotalDuration: number | null;
} | null;

type BossFightHudProps = {
    boss: BossHudSlice;
};

/**
 * Boss name inside HP bar, signature charges (when configured), CC pips; overlays the battle view.
 */
export default function BossFightHud({ boss }: BossFightHudProps) {
    if (!boss) return null;

    return (
        <div
            className="pointer-events-none absolute left-1/2 top-2 z-30 w-[min(28rem,calc(100%-1rem))] -translate-x-1/2"
            role="region"
            aria-label="Boss fight"
        >
            <div className="px-2 pt-1 pb-4">
                <div className="relative w-full">
                    <BossArcadeHpBar name={boss.name} hp={boss.hp} maxHp={boss.maxHp} />

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
                        <div className="flex shrink-0 justify-end">
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
