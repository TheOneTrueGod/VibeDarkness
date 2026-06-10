/**
 * AbilityBar - Renders the player's ability bar at the bottom of the screen.
 *
 * Manages ability selection, mobile description overlays, and disabled state
 * based on whose turn it is and resource availability.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getAbility } from '../../abilities/AbilityRegistry';
import { canAffordAbility } from '../../abilities/Ability';
import { unitAbilityHasTag } from '../../abilities/abilityUses';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit, UnitAbilityRuntimeState } from '../../game/units/Unit';
import { getLivingPetsOfUnit } from '../../game/units/petHelpers';
import AbilitySlot from './AbilitySlot';
import AbilityTooltip from './AbilityTooltip';
import RoundTrackerCard from './RoundTrackerCard';
import { getAbilityUseConfig, type RecoveryChargeType } from '../../abilities/abilityUses';
import { DEFAULT_PLAYER_ROUND_STAMINA_SURGE } from '../../game/GameEngine';

const RECOVERY_CHARGE_TYPES: RecoveryChargeType[] = ['staminaCharge', 'lightCharge', 'energyCharge', 'roundCharge'];

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
    /** Called when the player clicks the Wait button. */
    onWait?: () => void;
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
    onWaitHoverChange,
    gameState,
    allUnits = [],
    onRegisterCardTarget,
    conditionalCancelContext,
}: AbilityBarProps) {
    const [mobileDescIndex, setMobileDescIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(getUsesMobileCardLayout);
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
    const [animationNow, setAnimationNow] = useState<number>(() => performance.now());
    const [pulseParticles, setPulseParticles] = useState<PulseParticle[]>([]);
    const rowRef = React.useRef<HTMLDivElement | null>(null);
    const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const recoveryPillRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const prevRoundRef = React.useRef<number>(roundNumber);
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

    const handCards = useMemo(() => {
        return abilityIds
            .map((abilityId) => {
                const ability = getAbility(abilityId);
                if (!ability || !playerUnit) return null;
                const runtime = playerUnit.abilityRuntime[abilityId] as UnitAbilityRuntimeState | undefined;
                if (!runtime) return null;
                return { abilityId, ability, runtime };
            })
            .filter((entry): entry is { abilityId: string; ability: AbilityStatic; runtime: UnitAbilityRuntimeState } => Boolean(entry));
    }, [abilityIds, playerUnit]);

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

    return (
        <div className="relative bg-dark-900/80 border-t border-dark-700 p-3">
            {playerUnit && playerUnit.resources.length > 0 && (
                <div className="flex items-center justify-center gap-2 mb-2">
                    {playerUnit.resources.map((resource) => (
                        <div
                            key={resource.id}
                            className="px-2 py-0.5 rounded border text-xs"
                            style={{ borderColor: resource.color, color: resource.color }}
                        >
                            {resource.name}: {Math.round(resource.current)}
                        </div>
                    ))}
                </div>
            )}
            {/* Bottom-aligned row: round tracker and wait flank a centered card cluster; outer gaps are 2× the card–card gap (gap-4 vs gap-2). */}
            <div ref={rowRef} className="relative flex min-h-[158px] items-end justify-center gap-4">
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
                            className="absolute rounded-full bg-gray-300 pointer-events-none z-20"
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
                <RoundTrackerCard
                    roundNumber={roundNumber}
                    progress={roundProgress}
                    isPaused={isPaused}
                    staminaSurge={playerUnit?.stamina ?? DEFAULT_PLAYER_ROUND_STAMINA_SURGE}
                />
                {playerUnit && (
                    <>
                        {/* Hand cards: gap-2 between cards; gap-4 on parent separates tracker / cluster / wait */}
                        <div
                            className="flex max-w-[800px] flex-shrink-0 flex-wrap justify-center gap-2"
                            onPointerLeave={() => setHoveredCardId(null)}
                        >
                            {handCards.map((card, index) => {
                                const canAfford = playerUnit ? canAffordAbility(playerUnit, card.ability) : false;
                                const canUse = card.runtime.currentUses > 0;
                                const hasPetSource =
                                    card.ability.abilitySource?.type !== 'pet'
                                    || (playerUnit != null && getLivingPetsOfUnit(playerUnit, allUnits).length > 0);
                                const tagFilter = conditionalCancelContext?.abilityTagFilter;
                                const matchesTagFilter =
                                    !tagFilter || tagFilter.length === 0
                                    || tagFilter.every((tag) => playerUnit ? unitAbilityHasTag(playerUnit, card.abilityId, tag) : false);
                                const isDisabled =
                                    !isMyTurn
                                    || !canAfford
                                    || !canUse
                                    || !hasPetSource
                                    || (conditionalCancelContext != null && !matchesTagFilter);
                                const isHovered = hoveredCardId === card.abilityId;
                                const activeAbilityIds = playerUnit?.activeAbilities.map((a) => a.abilityId) ?? [];
                                const activeHandIndex = handCards.findIndex((c) => activeAbilityIds.includes(c.abilityId));
                                const isActive = activeHandIndex >= 0 && index === activeHandIndex && !isMyTurn;

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
                                            isSelected={selectedCardIndex === index}
                                            isActive={isActive}
                                            isDisabled={isDisabled}
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
                                        />
                                    </div>
                                );
                            })}

                            {handCards.length === 0 && (
                                <p className="text-muted w-full py-4 text-center text-sm">No cards in hand</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onWait}
                            disabled={!isMyTurn}
                            className={`flex h-[104px] w-[80px] flex-shrink-0 flex-col items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                                isMyTurn
                                    ? 'cursor-pointer border-dark-500 bg-dark-700 text-gray-200 hover:-translate-y-1 hover:border-gray-400 hover:bg-dark-600'
                                    : 'cursor-not-allowed border-dark-700 bg-dark-800 text-gray-600'
                            }`}
                            title={conditionalCancelContext ? 'Continue current ability (Space)' : 'Wait (Space)'}
                            aria-keyshortcuts="Space"
                            onPointerEnter={() => onWaitHoverChange?.(true)}
                            onPointerLeave={() => onWaitHoverChange?.(false)}
                        >
                            <span className="text-sm font-medium">
                                {conditionalCancelContext ? 'Continue' : 'Wait'}
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
                    </>
                )}

                {!playerUnit && (
                    <div className="flex min-h-[104px] w-full max-w-[800px] items-center justify-center" onPointerLeave={() => setHoveredCardId(null)}>
                        <p className="text-muted text-sm py-4">No cards in hand</p>
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
