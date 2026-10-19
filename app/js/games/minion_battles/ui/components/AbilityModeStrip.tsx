/**
 * AbilityModeStrip - always-visible row of per-cast mode buttons rendered directly under a hand card.
 *
 * Equal-width segments fill the parent width (works for 2-3 modes in a 108px card). Clicks never
 * bubble to the card so choosing a mode does not select the ability.
 */

import React from 'react';
import { TestIds } from '../../../../testing/testIds';
import { ABILITY_MODE_STRIP_HEIGHT_PX } from './battleUiSlots/battleBottomBarLayout';

export interface AbilityModeStripProps {
    modes: readonly string[];
    currentMode: string | undefined;
    /** Mode id → short label (falls back to the raw mode id). */
    labels?: Readonly<Record<string, string>>;
    /** Mode id → one-sentence description used as the segment tooltip. */
    descriptions?: Readonly<Record<string, string>>;
    onSelectMode: (mode: string) => void;
    /** False when it is not the player's turn: still shown, but dimmed and inert. */
    interactive: boolean;
    /** Distinguishes strips of different cards in tests (e.g. the slot ability id). */
    testIdSuffix?: string;
}

export function AbilityModeStrip({
    modes,
    currentMode,
    labels,
    descriptions,
    onSelectMode,
    interactive,
    testIdSuffix,
}: AbilityModeStripProps) {
    const swallow = (e: React.SyntheticEvent) => {
        e.stopPropagation();
        e.preventDefault();
    };
    const baseTestId = testIdSuffix
        ? `${TestIds.battleAbilityModeStrip}-${testIdSuffix}`
        : TestIds.battleAbilityModeStrip;

    return (
        <div
            role="group"
            aria-label="Ability mode"
            data-testid={baseTestId}
            className={`flex w-full items-stretch gap-0.5 ${interactive ? '' : 'opacity-50'}`}
            style={{ height: ABILITY_MODE_STRIP_HEIGHT_PX }}
            onClick={(e) => e.stopPropagation()}
        >
            {modes.map((mode) => {
                const label = labels?.[mode] ?? mode;
                const description = descriptions?.[mode];
                const title = description ? `${label}: ${description}` : label;
                const selected = currentMode === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        data-testid={`${baseTestId}-${mode}`}
                        title={title}
                        aria-label={title}
                        aria-pressed={selected}
                        disabled={!interactive}
                        onClick={(e) => {
                            swallow(e);
                            if (interactive) onSelectMode(mode);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                swallow(e);
                                if (interactive) onSelectMode(mode);
                            }
                        }}
                        className={`pointer-events-auto min-w-0 flex-1 truncate rounded border px-0.5 text-[10px] font-semibold leading-none transition-colors ${
                            selected
                                ? 'border-violet-400 bg-violet-700/80 text-white'
                                : 'border-violet-400/30 bg-violet-950/70 text-violet-300/70'
                        } ${
                            interactive
                                ? `cursor-pointer ${selected ? '' : 'hover:border-violet-300 hover:bg-violet-900/80 hover:text-violet-100'}`
                                : 'cursor-not-allowed'
                        }`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export default AbilityModeStrip;
