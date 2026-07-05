/**
 * AbilityBar - Renders the player's ability bar at the bottom of the screen.
 *
 * Manages ability selection, mobile description overlays, and disabled state
 * based on whose turn it is and resource availability.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getAbility } from '../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit, UnitAbilityRuntimeState } from '../../game/units/Unit';
import { getAbilityDisabledReason } from './abilityDisabledReason';
import AbilitySlot from './AbilitySlot';
import AbilityTooltip from './AbilityTooltip';
import RoundTrackerCard from './RoundTrackerCard';
import { getAbilityUseConfig, type RecoveryChargeType } from '../../abilities/abilityUses';
import { getAbilityBarLayoutKey, splitAbilityRows } from '../../abilities/abilityBarLayout';
import { DEFAULT_PLAYER_ROUND_STAMINA_SURGE } from '../../game/GameEngine';
import { UnitResourcePanel } from './resources/UnitResourcePanel';
import { useBattleActionRowHost } from '../../../../contexts/BattleActionRowContext';

const RECOVERY_CHARGE_TYPES: RecoveryChargeType[] = ['staminaCharge', 'lightCharge', 'energyCharge', 'roundCharge'];

/** Horizontal gutter beside vertical dividers in the center column (`px-3` × 2). */
const ACTION_BAR_DIVIDER_GUTTER_X_PX = 24;

/** True when the primary input is not mouse-like (e.g. touch-first). Avoids maxTouchPoints on hybrid desktops. */
function getUsesMobileCardLayout(): boolean {
    if (typeof window === 'undefined') return false;
    return !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

interface PulseParticle {
    id: string;
    startMs: number;
    durationMs: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    controlX: number;
    controlY: number;
    staggerMs: number;
    sizeFrom: number;
    sizeTo: number;
    alphaMode: 'fade' | 'rise';
}

interface AbilityBarProps {
    abilityIds: string[];
    /** The player's unit (for resource checks). */
    playerUnit: Unit | null;
    /** Whether it's this player's turn to act. */
    isMyTurn: boolean;
    roundNumber: number;
    roundProgress: number;
    isPaused: boolean;
    /** Currently selected card index (in the hand), or null. */
    selectedCardIndex: number | null;
    /** Called when a card is selected. */
    onSelectCard: (handIndex: number, ability: AbilityStatic) => void;
    /** Called when the player clicks the Wait / End Turn button. */
    onWait?: () => void;
    /** When true, the wait button renders as "End Turn" to confirm a nonconfirmed order. */
    hasNonconfirmedOrder?: boolean;
    /** Called when the wait button is hovered or unhovered. */
    onWaitHoverChange?: (hovered: boolean) => void;
    /** Current game state for dynamic descriptions. */
    gameState?: unknown;
    /** All battle units (for pet-sourced ability availability). */
    allUnits?: readonly Unit[];
    /** Register a card's page-center position per charge type (key = 'card:<chargeType>:<abilityId>'). */
    onRegisterCardTarget?: (key: string, pageX: number, pageY: number) => void;
    /**
     * When set, this pause is a mid-ability conditional cancel: only abilities matching
     * all tags are selectable (including the in-progress cast — click to cancel and retarget).
     * Use the Continue / Wait button to resume the current cast instead.
     */
    conditionalCancelContext?: {
        activeAbilityId: string;
        abilityTagFilter?: readonly string[];
    };
    /** Per-ability committed cast mode (BattlePhase-owned, persists for the battle). */
    abilityModeByAbilityId?: Record<string, string>;
    onCycleAbilityMode?: (abilityId: string, modes: readonly string[]) => void;
}

export default function AbilityBar({
    abilityIds,
    playerUnit,
    isMyTurn,
    roundNumber,
    roundProgress,
    isPaused,
    selectedCardIndex,
    onSelectCard,
    onWait,
    hasNonconfirmedOrder,
    onWaitHoverChange,
    gameState,
    allUnits = [],
    onRegisterCardTarget,
    conditionalCancelContext,
    abilityModeByAbilityId = {},
    onCycleAbilityMode,
}: AbilityBarProps) {
    const [mobileDescIndex, setMobileDescIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(getUsesMobileCardLayout);
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
    const [animationNow, setAnimationNow] = useState<number>(() => performance.now());
    const [pulseParticles, setPulseParticles] = useState<PulseParticle[]>([]);
    const rowRef = React.useRef<HTMLDivElement | null>(null);
    const centerColumnRef = React.useRef<HTMLDivElement | null>(null);
    const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const recoveryPillRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const prevRoundRef = React.useRef<number>(roundNumber);
    const battleActionRow = useBattleActionRowHost();
    const isFullBleedActionRow = battleActionRow?.actionRowHost != null;
    const prevRuntimeRef = React.useRef<
        Record<string, { currentUses: number; charges: Partial<Record<RecoveryChargeType, number>> }>
    >({});

    useEffect(() => {
        const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
        const sync = () => setIsMobile(!mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    // Prefer live unit.abilities order so swap-network replacements keep the same bar slot.
    const layoutKey = getAbilityBarLayoutKey(playerUnit, abilityIds);

    const visibleAbilityIds = useMemo(
        () => {
            const ordered = playerUnit?.abilities ?? abilityIds;
            return ordered.filter(id => {
                const runtime = playerUnit?.abilityRuntime[id];
                return !runtime || runtime.active !== false;
            });
        },
        // layoutKey tracks in-place swap-network mutations that keep the same unit reference.
        [layoutKey],
    );

    const handCards = useMemo(() => {
        return visibleAbilityIds
            .map((abilityId) => {
                const ability = getAbility(abilityId);
                if (!ability || !playerUnit) return null;
                const runtime = playerUnit.abilityRuntime[abilityId] as UnitAbilityRuntimeState | undefined;
                if (!runtime) return null;
                return { abilityId, ability, runtime };
            })
            .filter((entry): entry is { abilityId: string; ability: AbilityStatic; runtime: UnitAbilityRuntimeState } => Boolean(entry));
    }, [visibleAbilityIds, playerUnit]);

    const [firstRowCount, setFirstRowCount] = useState(() => handCards.length);

    useEffect(() => {
        const el = centerColumnRef.current;
        const contentWidth = Math.max(0, (el?.clientWidth ?? 0) - ACTION_BAR_DIVIDER_GUTTER_X_PX);
        setFirstRowCount(splitAbilityRows(handCards.length, contentWidth));
    }, [handCards.length]);

    useEffect(() => {
        const el = centerColumnRef.current;
        if (!el) return;
        const update = () => {
            const contentWidth = Math.max(0, el.clientWidth - ACTION_BAR_DIVIDER_GUTTER_X_PX);
            setFirstRowCount(splitAbilityRows(handCards.length, contentWidth));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [handCards.length]);

    const firstRowCards = handCards.slice(0, firstRowCount);
    const secondRowCards = handCards.slice(firstRowCount);
    const hasSecondAbilityRow = secondRowCards.length > 0;

    const runtimeSnapshot = useMemo<
        Record<string, { currentUses: number; charges: Partial<Record<RecoveryChargeType, number>> }>
    >(
        () =>
            Object.fromEntries(
                handCards.map((c) => [
                    c.abilityId,
                    {
                        currentUses: c.runtime.currentUses,
                        charges: { ...c.runtime.recoveryChargesByType },
                    },
                ]),
            ),
        [handCards],
    );

    useEffect(() => {
        if (hoveredCardId && !handCards.some((card) => card.abilityId === hoveredCardId)) {
            setHoveredCardId(null);
        }
    }, [handCards, hoveredCardId]);

    // Register card top-center page positions as HUD flight targets, keyed by charge type so
    // particles only fly to cards that actually recover that resource.
    useEffect(() => {
        if (!onRegisterCardTarget) return;
        for (const card of handCards) {
            const el = cardRefs.current[card.abilityId];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top;
            const chargeTypes = [...new Set(
                getAbilityUseConfig(card.abilityId).recoveries.map(r => r.chargeType),
            )];
            for (const chargeType of chargeTypes) {
                onRegisterCardTarget(`card:${chargeType}:${card.abilityId}`, cx, cy);
            }
        }
    }, [handCards, onRegisterCardTarget]);

    // Same-round mid-round recovery: particles from radius around pill → pill center.
    useEffect(() => {
        const prevRound = prevRoundRef.current;
        const prev = prevRuntimeRef.current;
        const gained = handCards
            .filter((card) => {
                const old = prev[card.abilityId];
                if (!old) return false;
                const nowUses = card.runtime.currentUses;
                if (nowUses > old.currentUses) return true;
                return RECOVERY_CHARGE_TYPES.some(
                    (k) => (card.runtime.recoveryChargesByType[k] ?? 0) > (old.charges[k] ?? 0),
                );
            })
            .map((c) => c.abilityId);

        if (gained.length > 0 && roundNumber === prevRound) {
            const rowEl = rowRef.current;
            if (rowEl) {
                const rowRect = rowEl.getBoundingClientRect();
                const start = performance.now();
                const particles = gained.flatMap((abilityId, idx) => {
                    const pillEl = recoveryPillRefs.current[abilityId];
                    if (!pillEl) return [];
                    const pillRect = pillEl.getBoundingClientRect();
                    const targetX = pillRect.left + pillRect.width / 2 - rowRect.left;
                    const targetY = pillRect.top + pillRect.height / 2 - rowRect.top;
                    return Array.from({ length: 6 }, (_, i) => {
                        const angle = Math.random() * Math.PI * 2;
                        const radius = 45 + Math.random() * 10;
                        const fromX = targetX + Math.cos(angle) * radius;
                        const fromY = targetY + Math.sin(angle) * radius;
                        const midX = (fromX + targetX) / 2;
                        const midY = (fromY + targetY) / 2;
                        return {
                            id: `pill-${abilityId}-${idx}-${i}-${start}`,
                            startMs: start,
                            durationMs: 520,
                            fromX,
                            fromY,
                            toX: targetX,
                            toY: targetY,
                            controlX: midX + (Math.random() - 0.5) * 10,
                            controlY: midY + (Math.random() - 0.5) * 10,
                            staggerMs: i * 28,
                            sizeFrom: 5.5,
                            sizeTo: 2,
                            alphaMode: 'rise' as const,
                        };
                    });
                });
                setPulseParticles((prevParticles) => [...prevParticles, ...particles]);
            }
        }
        prevRoundRef.current = roundNumber;
        prevRuntimeRef.current = runtimeSnapshot;
    }, [roundNumber, handCards, runtimeSnapshot]);

    useEffect(() => {
        if (pulseParticles.length === 0) return;
        let raf = 0;
        const tick = () => {
            const now = performance.now();
            setAnimationNow(now);
            setPulseParticles((prev) =>
                prev.filter((p) => now - p.startMs - p.staggerMs <= p.durationMs),
            );
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [pulseParticles.length]);

    const handleSelectCard = useCallback(
        (handIndex: number) => {
            const card = handCards[handIndex];
            if (!card) return;
            onSelectCard(handIndex, card.ability);
            setMobileDescIndex(null);
        },
        [handCards, onSelectCard],
    );

    const handleMobileDescToggle = useCallback(
        (index: number) => {
            setMobileDescIndex((prev) => (prev === index ? null : index));
        },
        [],
    );

    const handleMobileDescDismiss = useCallback(() => {
        setMobileDescIndex(null);
    }, []);

    // Get the mobile description ability if showing
    const mobileDescAbility = useMemo(() => {
        if (mobileDescIndex === null) return null;
        const card = handCards[mobileDescIndex];
        if (!card) return null;
        return card.ability;
    }, [mobileDescIndex, handCards]);

    const renderHandCard = (card: (typeof handCards)[number], index: number) => {
        if (!playerUnit) return null;
        const disabledReason = getAbilityDisabledReason({
            playerUnit,
            ability: card.ability,
            abilityId: card.abilityId,
            currentUses: card.runtime.currentUses,
            isMyTurn,
            allUnits,
            conditionalCancelContext,
        });
        const isHovered = hoveredCardId === card.abilityId;
        const activeAbilityIds = playerUnit.activeAbilities.map((a) => a.abilityId);
        const activeHandIndex = handCards.findIndex((c) => activeAbilityIds.includes(c.abilityId));
        const isSelected = selectedCardIndex === index;
        const isActive = activeHandIndex >= 0 && index === activeHandIndex && !isMyTurn;
        const abilityModes = card.ability.abilityModes;
        const currentAbilityMode = abilityModes
            ? (abilityModeByAbilityId[card.abilityId] ?? abilityModes.defaultMode)
            : undefined;
        const showModeToggle = Boolean(
            abilityModes &&
            isMyTurn &&
            (isSelected || isHovered),
        );

        return (
            <div
                key={card.abilityId}
                ref={(el) => {
                    cardRefs.current[card.abilityId] = el;
                }}
            >
                <AbilitySlot
                    ability={card.ability}
                    runtime={card.runtime}
                    isSelected={isSelected}
                    isActive={isActive}
                    disabledReason={disabledReason}
                    onSelect={() => handleSelectCard(index)}
                    isHovered={isHovered}
                    onHoverChange={(hovered) => {
                        if (hovered) {
                            setHoveredCardId(card.abilityId);
                        } else {
                            setHoveredCardId((prev) => (prev === card.abilityId ? null : prev));
                        }
                    }}
                    isMobile={isMobile}
                    showMobileDescription={mobileDescIndex === index}
                    onMobileDescriptionToggle={() => handleMobileDescToggle(index)}
                    onMobileDescriptionDismiss={handleMobileDescDismiss}
                    gameState={gameState}
                    onPrimaryRecoveryPillRef={(el) => {
                        recoveryPillRefs.current[card.abilityId] = el;
                    }}
                    abilityModes={abilityModes}
                    currentAbilityMode={currentAbilityMode}
                    showModeToggle={showModeToggle}
                    onCycleAbilityMode={
                        abilityModes && onCycleAbilityMode
                            ? () => onCycleAbilityMode(card.abilityId, abilityModes.modes)
                            : undefined
                    }
                />
            </div>
        );
    };

    const waitButton = (
        <button
            type="button"
            onClick={onWait}
            disabled={!isMyTurn}
            className={`flex h-[104px] w-[80px] flex-shrink-0 flex-col items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                isMyTurn
                    ? 'cursor-pointer border-dark-500 bg-dark-700 text-gray-200 hover:-translate-y-1 hover:border-gray-400 hover:bg-dark-600'
                    : 'cursor-not-allowed border-dark-700 bg-dark-800 text-gray-600'
            }`}
            title={conditionalCancelContext ? 'Continue current ability (Space)' : hasNonconfirmedOrder ? 'End Turn (Space)' : 'Wait (Space)'}
            aria-keyshortcuts="Space"
            onPointerEnter={() => onWaitHoverChange?.(true)}
            onPointerLeave={() => onWaitHoverChange?.(false)}
        >
            <span className="text-sm font-medium">
                {conditionalCancelContext ? 'Continue' : hasNonconfirmedOrder ? 'End Turn' : 'Wait'}
            </span>
            <kbd
                className={`mt-2 flex h-10 min-w-[3.5rem] items-center justify-center rounded border-2 px-2 font-mono text-[11px] font-semibold tracking-wide shadow-inner ${
                    isMyTurn
                        ? 'border-gray-500 bg-dark-800 text-gray-200'
                        : 'border-dark-600 bg-dark-900 text-gray-500'
                }`}
            >
                Space
            </kbd>
        </button>
    );

    return (
        <div
            className={`relative overflow-x-hidden border-t border-dark-700 bg-dark-900/80 ${
                isFullBleedActionRow ? 'p-4' : 'p-3'
            }`}
        >
            {/*
              Portrait (top) | ability rows (bottom-aligned) | end turn + round (top, same row)
              Full-bleed (lobby battle chrome): px-4 + w-80 side columns align with timeline and chat.
            */}
            <div
                ref={rowRef}
                className={`relative grid min-h-[158px] gap-y-2 ${
                    isFullBleedActionRow
                        ? 'grid-cols-[20rem_minmax(0,1fr)_20rem]'
                        : 'grid-cols-[20rem_minmax(0,1fr)_auto]'
                }`}
            >
                {pulseParticles.map((p) => {
                    const t = Math.max(0, Math.min(1, (animationNow - p.startMs - p.staggerMs) / p.durationMs));
                    const oneMinus = 1 - t;
                    const x = oneMinus * oneMinus * p.fromX + 2 * oneMinus * t * p.controlX + t * t * p.toX;
                    const y = oneMinus * oneMinus * p.fromY + 2 * oneMinus * t * p.controlY + t * t * p.toY;
                    const opacity = p.alphaMode === 'rise'
                        ? t
                        : (t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1);
                    const size = p.sizeFrom + (p.sizeTo - p.sizeFrom) * t;
                    return (
                        <div
                            key={p.id}
                            className="pointer-events-none absolute z-20 rounded-full bg-gray-300"
                            style={{
                                left: x - size / 2,
                                top: y - size / 2,
                                width: size,
                                height: size,
                                opacity: Math.max(0, Math.min(1, opacity)),
                            }}
                        />
                    );
                })}

                {/* Left portrait — top-aligned content, full-height divider */}
                <div className="relative col-start-1 row-span-2 flex w-80 shrink-0 self-stretch">
                    <div
                        className="pointer-events-none absolute inset-y-0 right-0 border-r border-dark-700"
                        aria-hidden
                    />
                    <div className="flex w-full items-start pr-3">
                        <UnitResourcePanel unit={playerUnit} />
                    </div>
                </div>

                {/* Center — ability rows; width measured for single- vs two-row split */}
                <div
                    ref={centerColumnRef}
                    className="col-start-2 row-start-1 row-span-2 grid min-w-0 grid-rows-[auto_auto] gap-y-2 self-end px-3 content-end"
                    onPointerLeave={() => setHoveredCardId(null)}
                >
                    <div className="flex min-w-0 flex-wrap content-end gap-2">
                        {playerUnit ? (
                            firstRowCards.length > 0 ? (
                                firstRowCards.map((card, i) => renderHandCard(card, i))
                            ) : (
                                <p className="text-muted w-full py-4 text-center text-sm">No cards in hand</p>
                            )
                        ) : (
                            <p className="text-muted w-full py-4 text-center text-sm">No cards in hand</p>
                        )}
                    </div>
                    <div className="flex min-w-0 flex-wrap content-end gap-2">
                        {hasSecondAbilityRow &&
                            secondRowCards.map((card, i) => renderHandCard(card, firstRowCount + i))}
                    </div>
                </div>

                {/* Right — end turn + round tracker on one row, top-aligned content */}
                {playerUnit && (
                    <div className="relative col-start-3 row-start-1 row-span-2 self-stretch">
                        <div
                            className={`pointer-events-none absolute inset-y-0 left-0 border-l ${
                                isFullBleedActionRow ? 'border-border-custom' : 'border-dark-700'
                            }`}
                            aria-hidden
                        />
                        <div className="flex items-start gap-2 pl-3">
                            {waitButton}
                            <RoundTrackerCard
                                roundNumber={roundNumber}
                                progress={roundProgress}
                                isPaused={isPaused}
                                staminaSurge={playerUnit.stamina ?? DEFAULT_PLAYER_ROUND_STAMINA_SURGE}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile tooltip overlay */}
            {isMobile && mobileDescAbility && (
                <AbilityTooltip
                    title={mobileDescAbility.name}
                    lines={mobileDescAbility.getTooltipText(gameState)}
                    isMobileOverlay
                    onDismiss={handleMobileDescDismiss}
                />
            )}
        </div>
    );
}
