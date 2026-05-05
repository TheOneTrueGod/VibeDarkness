import React from 'react';
import { BossBackground } from './BossBackground';
import { BossArcadeHpBar } from './BossArcadeHpBar';
import { BossCcArmourRow } from './BossCcArmourRow';

export type BossHudSlice = {
    name: string;
    hp: number;
    maxHp: number;
    effectiveHardCcThreshold: number;
    hardCcArmourConsumed: number;
    hardCcArmourEventSerial: number;
    lastHardCcEventKind: 'absorbed' | 'landed' | null;
} | null;

type BossFightHudProps = {
    boss: BossHudSlice;
};

/** Centered boss name + arcade HP bar; renders nothing when there is no living boss. */
export default function BossFightHud({ boss }: BossFightHudProps) {
    if (!boss) return null;

    return (
        <div
            className="pointer-events-none flex shrink-0 justify-center px-2 pt-1 pb-2"
            role="region"
            aria-label="Boss fight"
        >
            <BossBackground>
                <BossArcadeHpBar hp={boss.hp} maxHp={boss.maxHp} />
                <BossCcArmourRow
                    effectiveHardCcThreshold={boss.effectiveHardCcThreshold}
                    hardCcArmourConsumed={boss.hardCcArmourConsumed}
                    hardCcArmourEventSerial={boss.hardCcArmourEventSerial}
                    lastHardCcEventKind={boss.lastHardCcEventKind}
                />
                <p className="mt-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-gray-300 sm:text-sm">
                    {boss.name}
                </p>
            </BossBackground>
        </div>
    );
}
