/**
 * CardHand - Renders the player's hand of cards at the bottom of the screen.
 *
 * Manages card selection, mobile description overlays, and disabled state
 * based on whose turn it is and resource availability.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getAbility } from '../../abilities/AbilityRegistry';
import { canAffordAbility } from '../../abilities/Ability';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit, UnitAbilityRuntimeState } from '../../game/units/Unit';
import CardComponent from './CardComponent';
import CardTooltip from './CardTooltip';
import RoundTrackerCard from './RoundTrackerCard';
import type { RecoveryChargeType } from '../../abilities/abilityUses';

const RECOVERY_CHARGE_TYPES: RecoveryChargeType[] = ['staminaCharge', 'lightCharge', 'energyCharge', 'roundCharge'];

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

interface CardHandProps {
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
    /** Current game state for dynamic descriptions. */
    gameState?: unknown;
}

export default function CardHand({
    abilityIds,
    playerUnit,
    isMyTurn,
    roundNumber,
    roundProgress,
    isPaused,
    selectedCardIndex,
    onSelectCard,
    onWait,
    gameState,
}: CardHandProps) {
    const [mobileDescIndex, setMobileDescIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
    const [animationNow, setAnimationNow] = useState<number>(() => performance.now());
    const [pulseParticles, setPulseParticles] = useState<PulseParticle[]>([]);
    const rowRef = React.useRef<HTMLDivElement | null>(null);
    const roundTrackerRef = React.useRef<HTMLDivElement | null>(null);
    const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const recoveryPillRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const prevRoundRef = React.useRef<number>(roundNumber);
    const prevRuntimeRef = React.useRef<
        Record<string, { currentUses: number; charges: Partial<Record<RecoveryChargeType, number>> }>
    >({});

    // Detect mobile via touch support
    useEffect(() => {
        setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
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

        if (gained.length > 0) {
            const rowEl = rowRef.current;
            const trackerEl = roundTrackerRef.current;
            if (roundNumber !== prevRound && rowEl && trackerEl) {
                const rowRect = rowEl.getBoundingClientRect();
                const trackerRect = trackerEl.getBoundingClientRect();
                const trackerCenterX = trackerRect.left + trackerRect.width / 2 - rowRect.left;
                const trackerCenterY = trackerRect.top + trackerRect.height / 2 - rowRect.top;
                const start = performance.now();
                const particles = gained.flatMap((abilityId, idx) => {
                    const cardEl = cardRefs.current[abilityId];
                    if (!cardEl) return [];
                    const cardRect = cardEl.getBoundingClientRect();
                    const cardBottomCenterX = cardRect.left + cardRect.width / 2 - rowRect.left;
                    const cardBottomCenterY = cardRect.bottom - rowRect.top;
                    const chordMidX = (trackerCenterX + cardBottomCenterX) / 2;
                    const chordMidY = (trackerCenterY + cardBottomCenterY) / 2;
                    return Array.from({ length: 4 }, (_, i) => ({
                        id: `${abilityId}-${idx}-${i}-${start}`,
                        startMs: start,
                        durationMs: 850,
                        fromX: trackerCenterX + (Math.random() - 0.5) * 12,
                        fromY: trackerCenterY + (Math.random() - 0.5) * 12,
                        toX: cardBottomCenterX + (Math.random() - 0.5) * 12,
                        toY: cardBottomCenterY + (Math.random() - 0.5) * 12,
                        controlX: chordMidX + (Math.random() - 0.5) * 44,
                        // Screen Y grows downward; place control above chord midpoint so the arc bulges upward.
                        controlY: chordMidY - (48 + Math.random() * 56),
                        staggerMs: i * 45,
                        sizeFrom: 6,
                        sizeTo: 6,
                        alphaMode: 'fade' as const,
                    }));
                });
                setPulseParticles((prevParticles) => [...prevParticles, ...particles]);
            } else if (roundNumber === prevRound && rowEl) {
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
            {/* Fixed-height row for wait button and ability cards */}
            <div ref={rowRef} className="relative flex items-center gap-4 h-[158px]">
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
                {/* Wait + abilities */}
                {playerUnit && (
                    <>
                        <RoundTrackerCard
                            roundNumber={roundNumber}
                            progress={roundProgress}
                            isPaused={isPaused}
                            onRootRef={(el) => {
                                roundTrackerRef.current = el;
                            }}
                        />
                        <button
                            onClick={onWait}
                            disabled={!isMyTurn}
                            className={`flex flex-col items-center justify-center w-[80px] h-[104px] rounded-lg border-2 transition-all duration-150 flex-shrink-0 ${
                                isMyTurn
                                    ? 'bg-dark-700 border-dark-500 text-gray-200 hover:bg-dark-600 hover:border-gray-400 hover:-translate-y-1 cursor-pointer'
                                    : 'bg-dark-800 border-dark-700 text-gray-600 cursor-not-allowed'
                            }`}
                            title="Wait (Space)"
                        >
                            <span className="text-sm font-medium">Wait</span>
                            <svg
                                viewBox="0 0 80 20"
                                className="w-12 h-3 mt-1 text-gray-400"
                                aria-hidden
                            >
                                <rect
                                    x="2"
                                    y="2"
                                    width="76"
                                    height="16"
                                    rx="3"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                            </svg>
                        </button>
                    </>
                )}

                {/* Hand cards: max width 800px so bar doesn't grow too wide */}
                <div
                    className="flex gap-2 flex-1 justify-center min-w-0 max-w-[800px] items-center"
                    onPointerLeave={() => setHoveredCardId(null)}
                >
                    {handCards.map((card, index) => {
                        const canAfford = playerUnit ? canAffordAbility(playerUnit, card.ability) : false;
                        const canUse = card.runtime.currentUses > 0;
                        const isDisabled = !isMyTurn || !canAfford || !canUse;
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
                                <CardComponent
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
                        <p className="text-muted text-sm py-4">No cards in hand</p>
                    )}
                </div>
            </div>

            {/* Mobile tooltip overlay */}
            {isMobile && mobileDescAbility && (
                <CardTooltip
                    title={mobileDescAbility.name}
                    lines={mobileDescAbility.getTooltipText(gameState)}
                    isMobileOverlay
                    onDismiss={handleMobileDescDismiss}
                />
            )}
        </div>
    );
}
