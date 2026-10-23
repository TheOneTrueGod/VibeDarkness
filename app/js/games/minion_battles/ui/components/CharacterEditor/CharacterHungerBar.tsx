import { Ham } from 'lucide-react';
import { HUNGER_BLACK, HUNGER_ORANGE } from '../../../../../components/ResourcePill';
import {
    HUNGER_BAR_TOOLTIP,
    HUNGER_LOW_THRESHOLD_FRACTION,
} from '../../../character_defs/hungerHealth';

/** Matches the character-sheet portrait so the bar sits flush beneath it. */
export const CHARACTER_EDITOR_PORTRAIT_SIZE_PX = 200;

/** Always show this many digits; leftover width is leading zeros. */
export const HUNGER_BAR_DIGIT_COUNT = 3;

/** Extra space between Hunger digits (px). */
export const HUNGER_BAR_DIGIT_LETTER_SPACING_PX = 2;

/** Split current Hunger into leading zeros vs the significant digits. */
export function formatHungerBarDigits(hunger: number): { leadingZeros: string; significant: string } {
    const n = Number.isFinite(hunger) ? Math.max(0, Math.floor(hunger)) : 0;
    const significant = String(n);
    const padded = significant.padStart(Math.max(HUNGER_BAR_DIGIT_COUNT, significant.length), '0');
    return {
        leadingZeros: padded.slice(0, padded.length - significant.length),
        significant,
    };
}

/** Fill width as a percent of max Hunger (hunger / maxHunger). */
export function hungerBarFillPercent(hunger: number, maxHunger: number): number {
    if (!Number.isFinite(maxHunger) || maxHunger <= 0) return 0;
    if (!Number.isFinite(hunger) || hunger <= 0) return 0;
    return Math.min(100, (hunger / maxHunger) * 100);
}

export interface CharacterHungerBarProps {
    hunger: number;
    maxHunger: number;
    className?: string;
    /** Stretch to the parent's width instead of the character-sheet portrait width. */
    fullWidth?: boolean;
}

/** Current Hunger: orange Ham + orange fill on black with an orange outline, and a tick at the 15% penalty threshold. */
export function CharacterHungerBar({ hunger, maxHunger, className = '', fullWidth = false }: CharacterHungerBarProps) {
    const fillPercent = hungerBarFillPercent(hunger, maxHunger);
    const { leadingZeros, significant } = formatHungerBarDigits(hunger);
    return (
        <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${className}`}
            style={{
                backgroundColor: HUNGER_BLACK,
                borderColor: HUNGER_ORANGE,
                width: fullWidth ? '100%' : CHARACTER_EDITOR_PORTRAIT_SIZE_PX,
                maxWidth: '100%',
            }}
            title={HUNGER_BAR_TOOLTIP}
            aria-label={`Hunger ${hunger} of ${maxHunger}`}
        >
            <span className="flex shrink-0 items-center gap-0.5">
                <span
                    className="font-mono text-xs leading-none"
                    style={{
                        letterSpacing: HUNGER_BAR_DIGIT_LETTER_SPACING_PX,
                        marginRight: -HUNGER_BAR_DIGIT_LETTER_SPACING_PX,
                    }}
                    aria-hidden
                >
                    {leadingZeros ? <span className="text-zinc-500">{leadingZeros}</span> : null}
                    <span style={{ color: HUNGER_ORANGE }}>{significant}</span>
                </span>
                <Ham className="h-3.5 w-3.5 shrink-0" stroke={HUNGER_ORANGE} strokeWidth={2} aria-hidden />
            </span>
            <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                <div
                    className="h-full rounded-full"
                    style={{
                        width: `${fillPercent}%`,
                        backgroundColor: HUNGER_ORANGE,
                    }}
                />
                <div
                    className="absolute inset-y-0 w-px bg-zinc-500"
                    style={{ left: `${HUNGER_LOW_THRESHOLD_FRACTION * 100}%` }}
                    aria-hidden
                />
            </div>
        </div>
    );
}
