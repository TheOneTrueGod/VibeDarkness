/**
 * Tutorial step panel plus a pulsing pointer at the step's target (a unit, special tile or HUD element).
 * Portaled to `document.body` with fixed positioning so one overlay can point at the canvas and the card
 * hand; positions follow the camera every frame without re-rendering React.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { GameEngine } from '../../../game/GameEngine';
import type { Camera } from '../../../game/Camera';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import type { TutorialPointerTarget } from '../../../tutorials/tutorialTypes';
import {
    formatTutorialStepText,
    nextButtonLabel,
    tutorialTextSegments,
    type ActiveTutorial,
} from '../../../tutorials/tutorialLogic';
import { findTutorialUnit, tutorialUnitView } from '../../../tutorials/tutorialUnits';
import { abilityCardHudAnchorId, getHudAnchorRect } from '../hudAnchors';

interface TutorialOverlayProps {
    tutorial: ActiveTutorial;
    engine: GameEngine;
    camera: Camera;
    /** The element the battle canvas fills; world targets are offset by its page position. */
    canvasAreaRef: React.RefObject<HTMLElement | null>;
    onNext: () => void;
    onSkip: () => void;
}

/** Page-space box around the pointer target; round for world targets, rounded-rect for HUD elements. */
interface PointerBox {
    left: number;
    top: number;
    width: number;
    height: number;
    round: boolean;
}

const RING_PADDING_PX = 6;
const MIN_WORLD_RING_PX = 36;
const PANEL_WIDTH_PX = 380;
const PANEL_TOP_OFFSET_PX = 56;
const ARROW_SIZE_PX = 20;
const PANEL_TARGET_GAP_PX = 14;

function nearestTo<T extends { x: number; y: number }>(items: T[], from: { x: number; y: number } | undefined): T | undefined {
    if (!from) return items[0];
    let best: T | undefined;
    let bestDistSq = Infinity;
    for (const item of items) {
        const distSq = (item.x - from.x) ** 2 + (item.y - from.y) ** 2;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            best = item;
        }
    }
    return best;
}

function domBox(rect: DOMRect | null): PointerBox | null {
    if (!rect || rect.width === 0) return null;
    return {
        left: rect.left - RING_PADDING_PX,
        top: rect.top - RING_PADDING_PX,
        width: rect.width + RING_PADDING_PX * 2,
        height: rect.height + RING_PADDING_PX * 2,
        round: false,
    };
}

/** Resolve a pointer target to a page-space box this frame (null when missing or off screen). */
function resolvePointer(
    target: TutorialPointerTarget,
    engine: GameEngine,
    camera: Camera,
    canvasRect: DOMRect | null,
): PointerBox | null {
    const worldBox = (x: number, y: number, radius: number): PointerBox | null => {
        if (!canvasRect) return null;
        const s = camera.worldToScreen(x, y);
        if (s.x < 0 || s.y < 0 || s.x > canvasRect.width || s.y > canvasRect.height) return null;
        const size = Math.max(MIN_WORLD_RING_PX, (radius * 2 + RING_PADDING_PX * 2) * camera.zoom);
        return {
            left: canvasRect.left + s.x - size / 2,
            top: canvasRect.top + s.y - size / 2,
            width: size,
            height: size,
            round: true,
        };
    };
    const local = engine.getLocalPlayerUnit();
    switch (target.type) {
        case 'unit': {
            const unit = findTutorialUnit(engine, target, camera);
            return unit ? worldBox(unit.x, unit.y, unit.radius) : null;
        }
        case 'specialTile': {
            const tiles = engine.specialTiles
                .filter((t) => t.defId === target.defId)
                .map((t) => ({ x: (t.col + 0.5) * CELL_SIZE, y: (t.row + 0.5) * CELL_SIZE }));
            const tile = nearestTo(tiles, local);
            return tile ? worldBox(tile.x, tile.y, CELL_SIZE / 2) : null;
        }
        case 'abilityCard': {
            for (const id of target.abilityIds) {
                const box = domBox(getHudAnchorRect(abilityCardHudAnchorId(id)));
                if (box) return box;
            }
            return null;
        }
        case 'hudAnchor':
            return domBox(getHudAnchorRect(target.anchorId));
    }
}

export default function TutorialOverlay({ tutorial, engine, camera, canvasAreaRef, onNext, onSkip }: TutorialOverlayProps) {
    const { def, step } = tutorial;
    const stepDef = def.steps[step];
    const pointAt = stepDef?.pointAt;
    const panelRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const arrowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let raf = 0;
        const update = () => {
            const canvasRect = canvasAreaRef.current?.getBoundingClientRect() ?? null;
            const panel = panelRef.current;
            if (panel && canvasRect) {
                const width = Math.min(PANEL_WIDTH_PX, canvasRect.width - 16);
                panel.style.width = `${width}px`;
                panel.style.left = `${canvasRect.left + (canvasRect.width - width) / 2}px`;
                panel.style.top = `${canvasRect.top + PANEL_TOP_OFFSET_PX}px`;
            }
            const box = pointAt ? resolvePointer(pointAt, engine, camera, canvasRect) : null;
            if (panel && canvasRect && box) {
                // Keep the panel off the thing it points at: drop it below the target when they would overlap.
                const panelTop = canvasRect.top + PANEL_TOP_OFFSET_PX;
                const panelBottom = panelTop + panel.offsetHeight;
                const boxBottom = box.top + box.height;
                if (box.top < panelBottom && boxBottom > panelTop) {
                    panel.style.top = `${boxBottom + PANEL_TARGET_GAP_PX}px`;
                }
            }
            const ring = ringRef.current;
            const arrow = arrowRef.current;
            if (ring && arrow) {
                if (!box) {
                    ring.style.display = 'none';
                    arrow.style.display = 'none';
                } else {
                    ring.style.display = '';
                    ring.style.left = `${box.left}px`;
                    ring.style.top = `${box.top}px`;
                    ring.style.width = `${box.width}px`;
                    ring.style.height = `${box.height}px`;
                    ring.style.borderRadius = box.round ? '9999px' : '10px';
                    arrow.style.display = '';
                    arrow.style.left = `${box.left + box.width / 2 - ARROW_SIZE_PX / 2}px`;
                    arrow.style.top = `${box.top - ARROW_SIZE_PX - 10}px`;
                }
            }
            raf = requestAnimationFrame(update);
        };
        raf = requestAnimationFrame(update);
        return () => cancelAnimationFrame(raf);
    }, [pointAt, engine, camera, canvasAreaRef]);

    if (!stepDef) return null;
    const nextLabel = nextButtonLabel(def, step);
    const pointedUnit = pointAt?.type === 'unit' ? findTutorialUnit(engine, pointAt, camera) : undefined;
    const stepText = formatTutorialStepText(
        stepDef.text,
        pointedUnit ? tutorialUnitView(pointedUnit, engine.getLocalPlayerUnit()?.teamId ?? 'player', engine.gameTime) : null,
    );

    return createPortal(
        <div className="pointer-events-none fixed inset-0 z-40" data-testid="battle-tutorial">
            <div
                ref={ringRef}
                className="fixed animate-pulse border-[3px] border-yellow-300"
                style={{ display: 'none', boxShadow: '0 0 12px rgba(253, 224, 71, 0.8)' }}
            />
            <div ref={arrowRef} className="fixed animate-bounce" style={{ display: 'none' }}>
                <svg width={ARROW_SIZE_PX} height={ARROW_SIZE_PX} viewBox="0 0 20 20" aria-hidden>
                    <polygon points="2,4 18,4 10,17" fill="#fde047" stroke="#1f2937" strokeWidth="1.5" />
                </svg>
            </div>
            <div
                ref={panelRef}
                role="dialog"
                aria-label={def.title}
                className="pointer-events-auto fixed rounded-lg border border-yellow-300/60 bg-surface px-4 py-3 text-white shadow-lg"
                style={{ width: PANEL_WIDTH_PX }}
            >
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-yellow-300">
                    <span>{def.title}</span>
                    {def.steps.length > 1 && (
                        <span className="text-muted">
                            {step + 1} / {def.steps.length}
                        </span>
                    )}
                </div>
                <p className="whitespace-pre-line text-sm leading-snug">
                    {tutorialTextSegments(stepText).map((seg, i) =>
                        seg.color ? (
                            <span key={i} className="font-semibold" style={{ color: seg.color }}>
                                {seg.text}
                            </span>
                        ) : (
                            <React.Fragment key={i}>{seg.text}</React.Fragment>
                        ),
                    )}
                </p>
                <div className="mt-2 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onSkip}
                        className="text-xs text-muted underline-offset-2 hover:text-white hover:underline"
                    >
                        Skip tutorial
                    </button>
                    {nextLabel && (
                        <button
                            type="button"
                            onClick={onNext}
                            className="rounded bg-yellow-400 px-3 py-1 text-sm font-semibold text-gray-900 hover:bg-yellow-300"
                        >
                            {nextLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
