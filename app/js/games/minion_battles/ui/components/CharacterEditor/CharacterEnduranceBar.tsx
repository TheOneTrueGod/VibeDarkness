import { Heart } from 'lucide-react';
import {
    ENDURANCE_PILL_BACKGROUND,
    EXHAUSTION_PILL_RED,
    REMAINING_ENDURANCE_TOOLTIP,
} from '../../../../../components/ResourcePill';

/** Matches the character-sheet portrait so the bar sits flush beneath it. */
export const CHARACTER_EDITOR_PORTRAIT_SIZE_PX = 200;

/** Always show this many digits; leftover width is leading zeros. */
export const ENDURANCE_BAR_DIGIT_COUNT = 3;

/** Extra space between endurance digits (px). */
export const ENDURANCE_BAR_DIGIT_LETTER_SPACING_PX = 2;

/** Split remaining endurance into leading zeros vs the significant digits. */
export function formatEnduranceBarDigits(remaining: number): { leadingZeros: string; significant: string } {
    const n = Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0;
    const significant = String(n);
    const padded = significant.padStart(Math.max(ENDURANCE_BAR_DIGIT_COUNT, significant.length), '0');
    return {
        leadingZeros: padded.slice(0, padded.length - significant.length),
        significant,
    };
}

/** Fill width as a percent of max endurance (remaining / endurance). */
export function enduranceBarFillPercent(remaining: number, endurance: number): number {
    if (!Number.isFinite(endurance) || endurance <= 0) return 0;
    if (!Number.isFinite(remaining) || remaining <= 0) return 0;
    return Math.min(100, (remaining / endurance) * 100);
}

export interface CharacterEnduranceBarProps {
    remaining: number;
    endurance: number;
    className?: string;
}

/** Remaining endurance: red heart + borderless red bar on black with a red outline, under the portrait. */
export function CharacterEnduranceBar({
    remaining,
    endurance,
    className = '',
}: CharacterEnduranceBarProps) {
    const fillPercent = enduranceBarFillPercent(remaining, endurance);
    const { leadingZeros, significant } = formatEnduranceBarDigits(remaining);
    return (
        <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${className}`}
            style={{
                backgroundColor: ENDURANCE_PILL_BACKGROUND,
                borderColor: EXHAUSTION_PILL_RED,
                width: CHARACTER_EDITOR_PORTRAIT_SIZE_PX,
                maxWidth: '100%',
            }}
            title={REMAINING_ENDURANCE_TOOLTIP}
            aria-label={`Endurance ${remaining} of ${endurance}`}
        >
            <span className="flex shrink-0 items-center gap-0.5">
                <span
                    className="font-mono text-xs leading-none"
                    style={{
                        letterSpacing: ENDURANCE_BAR_DIGIT_LETTER_SPACING_PX,
                        marginRight: -ENDURANCE_BAR_DIGIT_LETTER_SPACING_PX,
                    }}
                    aria-hidden
                >
                    {leadingZeros ? <span className="text-zinc-500">{leadingZeros}</span> : null}
                    <span className="text-white">{significant}</span>
                </span>
                <Heart
                    className="h-3.5 w-3.5 shrink-0"
                    fill={EXHAUSTION_PILL_RED}
                    stroke={EXHAUSTION_PILL_RED}
                    strokeWidth={2}
                    aria-hidden
                />
            </span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                <div
                    className="h-full rounded-full"
                    style={{
                        width: `${fillPercent}%`,
                        backgroundColor: EXHAUSTION_PILL_RED,
                    }}
                />
            </div>
        </div>
    );
}
