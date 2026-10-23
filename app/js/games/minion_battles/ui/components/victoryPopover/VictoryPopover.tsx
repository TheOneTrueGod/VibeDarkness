/**
 * Victory popover: one consistently placed, centred card that plays the whole end-of-mission flow in order
 * (objectives crossed off, "Victory" title, Hunger to HP conversion, rewards, Continue). Timings live in
 * `victorySequence.ts`.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { TestIds } from '../../../../../testing/testIds';
import { getFastVictorySequence, subscribeFastVictorySequence } from '../../../../../debugFlags';
import type { CampaignRewardsPayload } from '../../../storylines/questRun';
import type { VictoryHealthConversion } from '../../../storylines/victoryHealthConversion';
import HungerToHealthConversion from './HungerToHealthConversion';
import VictoryRewardSections, { type VictoryMissionRewards } from './VictoryRewardSections';
import { useVictorySequence } from './useVictorySequence';
import {
    VICTORY_OBJECTIVE_STAGGER_MS,
    VICTORY_SEQUENCE_FAST_SPEED_MULTIPLIER,
    hasReachedStage,
    type VictoryTimedStage,
} from './victorySequence';

export interface VictoryObjectiveRow {
    id: string;
    label: string;
}

interface VictoryPopoverProps {
    missionRewards: VictoryMissionRewards | null;
    /**
     * Quest-clear Campaign Rewards (completion + queued). Shown under Campaign Results.
     */
    campaignRewards?: CampaignRewardsPayload | null;
    /**
     * False while the async persist / quest-plan work is still running: the popover plays its objectives and
     * title, then holds before the conversion and rewards; Continue never shows before this is true.
     */
    resultsReady?: boolean;
    /** Objective rows still open at victory; crossed off at the start of the sequence. */
    objectives?: VictoryObjectiveRow[];
    /** Hunger to HP conversion; null/omitted when nothing converts (no Hunger loss, spectator). */
    conversion?: VictoryHealthConversion | null;
    onClose: () => void;
    /** Optional side missions branching off the completed mission. */
    sideMissions?: Array<{ missionId: string; name: string }>;
    /** Called when the player chooses to start a side mission instead of continuing. */
    onStartSideMission?: (missionId: string) => void;
    /** Whether the current player is the host. Controls which Continue UI is shown. */
    isHost?: boolean;
    /** Lobby ID the host created for the next mission (clients poll for this). */
    nextLobbyId?: string | null;
    /** Client-only: join the next lobby that the host created. */
    onJoinNextLobby?: (lobbyId: string) => Promise<void>;
    /**
     * When true, every player gets an active Continue (race-safe quest claim on the server).
     * Skips the host-only / waiting-for-host split used for normal mission continue.
     */
    questContinuation?: boolean;
    /** Quest chain banner (e.g. progress or quest-complete). */
    questBanner?: string | null;
    /** Host Continue button label override. */
    continueLabel?: string;
}

function prefersReducedMotion(): boolean {
    try {
        return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/** Opacity + slight rise transition used by every section as its stage starts. */
function revealStyle(visible: boolean, durationMs: number): React.CSSProperties {
    return {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: durationMs > 0 ? `opacity ${durationMs}ms ease-out, transform ${durationMs}ms ease-out` : 'none',
    };
}

/** Mounts hidden, then fades in (a no-op transition when `durationMs` is 0, e.g. reduced motion). */
function Reveal({
    durationMs,
    className,
    children,
}: {
    durationMs: number;
    className?: string;
    children: React.ReactNode;
}) {
    const [visible, setVisible] = useState(durationMs <= 0);
    useEffect(() => {
        if (visible) return undefined;
        const id = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(id);
    }, [visible]);
    return (
        <div className={className} style={revealStyle(visible, durationMs)}>
            {children}
        </div>
    );
}

function ObjectiveCrossOffRow({
    row,
    index,
    staggerMs,
    instant,
}: {
    row: VictoryObjectiveRow;
    index: number;
    staggerMs: number;
    instant: boolean;
}) {
    const [armed, setArmed] = useState(instant);
    useEffect(() => {
        if (armed) return undefined;
        const id = requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)));
        return () => cancelAnimationFrame(id);
    }, [armed]);
    const delay = armed && !instant ? index * staggerMs : 0;
    return (
        <li
            className={`flex items-start gap-2 rounded-md px-1.5 py-0.5 text-left text-sm leading-snug ${
                armed ? 'text-gray-500' : 'text-gray-200'
            }`}
            style={{ transition: `color 150ms ease-out ${delay}ms` }}
        >
            <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                    armed
                        ? 'border-emerald-600/80 bg-green-900/40 text-green-400'
                        : 'border-border-custom bg-dark-900 text-gray-500'
                }`}
                style={{ transition: `background-color 150ms ease-out ${delay}ms, border-color 150ms ease-out ${delay}ms` }}
                aria-hidden
            >
                {armed ? '✓' : ''}
            </span>
            <span className={armed ? 'line-through' : ''}>{row.label}</span>
        </li>
    );
}

export default function VictoryPopover({
    missionRewards,
    campaignRewards = null,
    resultsReady = true,
    objectives = [],
    conversion = null,
    onClose,
    sideMissions,
    onStartSideMission,
    isHost,
    nextLobbyId,
    onJoinNextLobby,
    questContinuation = false,
    questBanner,
    continueLabel = 'Continue',
}: VictoryPopoverProps) {
    const fast = useSyncExternalStore(subscribeFastVictorySequence, getFastVictorySequence, getFastVictorySequence);
    const [reducedMotion] = useState(prefersReducedMotion);
    const speedMultiplier = fast ? VICTORY_SEQUENCE_FAST_SPEED_MULTIPLIER : 1;
    const hasObjectives = objectives.length > 0;
    const hasConversion = resultsReady && conversion != null;

    const { stage, stageDurationMs, skip } = useVictorySequence(
        { hasObjectives, hasConversion, speedMultiplier, reducedMotion },
        resultsReady,
    );

    const reached = (s: VictoryTimedStage) => hasReachedStage(stage, s);
    // Everything after the title waits for the results; before them only objectives + title can show.
    const reachedReady = (s: VictoryTimedStage) => resultsReady && reached(s);
    const showTitle = reached('title');
    const showConversion = hasConversion && reachedReady('conversion');
    const showRewards = reachedReady('rewards');
    const showContinue = reachedReady('continue');

    const continueButtonClass =
        'px-6 py-2 bg-primary hover:bg-primary-hover text-secondary font-medium rounded transition-colors';

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 animate-fade-in"
            data-testid={TestIds.victoryPopover}
            data-stage={stage}
            onClick={stage === 'done' ? undefined : skip}
        >
            {/* Anchored near the top and fixed in width: content grows downward without moving the card or title. */}
            <div className="fixed left-1/2 top-[12vh] max-h-[80vh] w-[min(560px,92vw)] -translate-x-1/2 overflow-y-auto rounded-lg border border-border-custom bg-surface-light p-8 text-center shadow-xl">
                {/* Title band: reserved from the first frame. */}
                <div className="flex h-10 items-center justify-center">
                    <h2
                        className="text-2xl font-bold text-success"
                        style={revealStyle(showTitle, stageDurationMs('title'))}
                    >
                        Victory!
                    </h2>
                </div>
                {questBanner ? <p className="mb-3 text-sm text-primary">{questBanner}</p> : null}
                {hasObjectives ? (
                    <ul className="mx-auto mb-4 flex max-w-sm flex-col gap-1" aria-label="Objectives">
                        {objectives.map((row, i) => (
                            <ObjectiveCrossOffRow
                                key={row.id}
                                row={row}
                                index={i}
                                staggerMs={VICTORY_OBJECTIVE_STAGGER_MS / speedMultiplier}
                                instant={reducedMotion}
                            />
                        ))}
                    </ul>
                ) : null}
                {conversion && hasConversion ? (
                    <div className="mb-5">
                        {showConversion ? (
                            <Reveal durationMs={stageDurationMs('conversion') * 0.3}>
                                <HungerToHealthConversion
                                    conversion={conversion}
                                    active
                                    durationMs={stageDurationMs('conversion')}
                                />
                            </Reveal>
                        ) : null}
                    </div>
                ) : null}
                {showRewards ? (
                    <Reveal durationMs={stageDurationMs('rewards')}>
                        <VictoryRewardSections
                            missionRewards={missionRewards}
                            campaignRewards={campaignRewards}
                            showFallback={resultsReady}
                        />
                    </Reveal>
                ) : null}
                {showContinue ? (
                    <Reveal durationMs={stageDurationMs('continue')}>
                        {sideMissions && sideMissions.length > 0 && (
                            <div className="mb-4">
                                <p className="mb-2 text-xs text-muted">Optional side quests available:</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {sideMissions.map((sm) => (
                                        <button
                                            key={sm.missionId}
                                            type="button"
                                            className="px-4 py-2 bg-violet-800 hover:bg-violet-700 text-violet-100 font-medium rounded transition-colors border border-violet-600"
                                            onClick={() => onStartSideMission?.(sm.missionId)}
                                        >
                                            {sm.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-center">
                            {/* Quest continuation: any party member claims the same next lobby. */}
                            {questContinuation ? (
                                <button
                                    type="button"
                                    data-testid={TestIds.victoryPopoverContinue}
                                    className={continueButtonClass}
                                    onClick={onClose}
                                >
                                    {continueLabel}
                                </button>
                            ) : (
                                <>
                                    {/* Host (or solo play): existing continue flow */}
                                    {(isHost === true || isHost === undefined) && (
                                        <button
                                            type="button"
                                            data-testid={TestIds.victoryPopoverContinue}
                                            className={continueButtonClass}
                                            onClick={onClose}
                                        >
                                            {continueLabel}
                                        </button>
                                    )}
                                    {/* Client, waiting for host to choose next mission */}
                                    {isHost === false && !nextLobbyId && (
                                        <button
                                            type="button"
                                            className="px-6 py-2 bg-gray-600 text-gray-400 font-medium rounded cursor-not-allowed"
                                            disabled
                                        >
                                            Waiting for host…
                                        </button>
                                    )}
                                    {/* Client, host has created next lobby */}
                                    {isHost === false && nextLobbyId && (
                                        <button
                                            type="button"
                                            data-testid={TestIds.victoryPopoverContinue}
                                            className={continueButtonClass}
                                            onClick={() => onJoinNextLobby?.(nextLobbyId)}
                                        >
                                            {continueLabel}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </Reveal>
                ) : null}
            </div>
        </div>
    );
}
