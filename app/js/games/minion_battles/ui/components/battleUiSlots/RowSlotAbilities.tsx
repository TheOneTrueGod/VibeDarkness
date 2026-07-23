/**
 * RowSlotAbilities - the Bottom Row slot's content: the player's ability-card hand.
 * Extracted from the old AbilityBar's center column. Cards wrap into up to two rows sized to
 * the slot's width; if a hand still overflows the fixed row height, it scrolls rather than clip.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getAbility } from '../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { Unit, UnitAbilityRuntimeState } from '../../../game/units/Unit';
import { getAbilityDisabledReason } from '../abilityDisabledReason';
import AbilitySlot from '../AbilitySlot';
import AbilityTooltip from '../AbilityTooltip';
import { getAbilityUseConfig, type RecoveryChargeType } from '../../../abilities/abilityUses';
import { getAbilityBarLayoutKey, splitAbilityRows } from '../../../abilities/abilityBarLayout';

const RECOVERY_CHARGE_TYPES: RecoveryChargeType[] = ['staminaCharge', 'lightCharge', 'energyCharge', 'roundCharge'];

/** Horizontal gutter to subtract from the measured width (matches the slot's own px-3 padding). */
const ABILITY_ROW_GUTTER_X_PX = 24;

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

interface RowSlotAbilitiesProps {
    abilityIds: string[];
    /** The player's unit (for resource checks). */
    playerUnit: Unit | null;
    /** Whether it's this player's turn to act. */
    isMyTurn: boolean;
    roundNumber: number;
    /** Currently selected card index (in the hand), or null. */
    selectedCardIndex: number | null;
    /** Ability id of the committed special on the nonconfirmed order, if any. */
    specialActionAbilityId?: string | null;
    /** Called when a card is selected. */
    onSelectCard: (handIndex: number, ability: AbilityStatic) => void;
    /** Current game state for dynamic descriptions. */
    gameState?: unknown;
    /** All battle units (for pet-sourced ability availability). */
    allUnits?: readonly Unit[];
    /** Register a card's page-center position per charge type (key = 'card:<chargeType>:<abilityId>'). */
    onRegisterCardTarget?: (key: string, pageX: number, pageY: number) => void;
    /**
     * When set, this pause is a mid-ability conditional cancel: only abilities matching
     * all tags are selectable (including the in-progress cast — click to cancel and retarget).
     */
    conditionalCancelContext?: {
        activeAbilityId: string;
        abilityTagFilter?: readonly string[];
    };
    /** Per-ability committed cast mode (BattlePhase-owned, persists for the battle). */
    abilityModeByAbilityId?: Record<string, string>;
    onCycleAbilityMode?: (abilityId: string, modes: readonly string[]) => void;
    /** Called with the hovered card's ability, or null on unhover — only fires while the card is selectable. */
    onHoverAbility?: (ability: AbilityStatic | null) => void;
    /** The turn indicator plaque (and ITS playahead controls); pinned to the top of this slot. */
    turnIndicator?: React.ReactNode;
}

export default function RowSlotAbilities({
    abilityIds,
    playerUnit,
    isMyTurn,
    roundNumber,
    selectedCardIndex,
    specialActionAbilityId = null,
    onSelectCard,
    gameState,
    allUnits = [],
    onRegisterCardTarget,
    conditionalCancelContext,
    abilityModeByAbilityId = {},
    onCycleAbilityMode,
    onHoverAbility,
    turnIndicator,
}: RowSlotAbilitiesProps) {
    const [mobileDescIndex, setMobileDescIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(getUsesMobileCardLayout);
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
    const [animationNow, setAnimationNow] = useState<number>(() => performance.now());
    const [pulseParticles, setPulseParticles] = useState<PulseParticle[]>([]);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
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
        const el = containerRef.current;
        const contentWidth = Math.max(0, (el?.clientWidth ?? 0) - ABILITY_ROW_GUTTER_X_PX);
        setFirstRowCount(splitAbilityRows(handCards.length, contentWidth));
    }, [handCards.length]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const contentWidth = Math.max(0, el.clientWidth - ABILITY_ROW_GUTTER_X_PX);
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

    // Only surface the hovered ability to the parent (for the timeline preview) while the card
    // is actually selectable — same rules that gate clicking it.
    useEffect(() => {
        if (!onHoverAbility) return;
        const card = hoveredCardId ? handCards.find((c) => c.abilityId === hoveredCardId) : null;
        if (!card || !playerUnit) {
            onHoverAbility(null);
            return;
        }
        const disabledReason = getAbilityDisabledReason({
            playerUnit,
            ability: card.ability,
            abilityId: card.abilityId,
            currentUses: card.runtime.currentUses,
            isMyTurn,
            allUnits,
            conditionalCancelContext,
        });
        onHoverAbility(disabledReason == null ? card.ability : null);
    }, [hoveredCardId, handCards, playerUnit, isMyTurn, allUnits, conditionalCancelContext, onHoverAbility]);

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
            const containerEl = containerRef.current;
            if (containerEl) {
                const containerRect = containerEl.getBoundingClientRect();
                const start = performance.now();
                const particles = gained.flatMap((abilityId, idx) => {
                    const pillEl = recoveryPillRefs.current[abilityId];
                    if (!pillEl) return [];
                    const pillRect = pillEl.getBoundingClientRect();
                    const targetX = pillRect.left + pillRect.width / 2 - containerRect.left;
                    const targetY = pillRect.top + pillRect.height / 2 - containerRect.top;
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
        const isSelected =
            selectedCardIndex === index
            || (specialActionAbilityId != null && card.abilityId === specialActionAbilityId);
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

    return (
        <div className="flex h-full min-w-0 flex-col">
            {turnIndicator}
            <div
                ref={containerRef}
                className="relative grid min-h-0 flex-1 grid-rows-[auto_auto] content-end gap-y-2 overflow-y-auto"
                onPointerLeave={() => setHoveredCardId(null)}
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
