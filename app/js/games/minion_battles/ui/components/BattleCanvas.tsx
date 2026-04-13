/**
 * BattleCanvas - PixiJS canvas wrapper for the battle phase.
 *
 * Mounts a <canvas>, initializes the PixiJS Application and GameRenderer,
 * handles resize, and forwards mouse events for the targeting system.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { GameRenderer } from '../../game/GameRenderer';
import type { GameEngine } from '../../game/GameEngine';
import type { Camera } from '../../game/Camera';

interface BattleCanvasProps {
    engine: GameEngine;
    camera: Camera;
    renderer: GameRenderer;
    targetingStateRef?: React.RefObject<Record<string, unknown> | null>;
    /** Called when the user left-clicks on the canvas (screen-space coords). */
    onCanvasClick?: (screenX: number, screenY: number) => void;
    /** Called when the user right-clicks on the canvas (screen-space coords). */
    onCanvasRightClick?: (screenX: number, screenY: number) => void;
    /** Called when the mouse moves on the canvas (screen-space coords). */
    onCanvasMouseMove?: (screenX: number, screenY: number) => void;
}

export default function BattleCanvas({
    engine,
    camera,
    renderer,
    targetingStateRef,
    onCanvasClick,
    onCanvasRightClick,
    onCanvasMouseMove,
}: BattleCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const dragStateRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        lastX: number;
        lastY: number;
        dragging: boolean;
    } | null>(null);
    const suppressClickRef = useRef(false);
    const autoFollowPausedUntilRef = useRef(0);
    const resumeAutoFollowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const keysHeldRef = useRef<Set<string>>(new Set());

    const PAN_SPEED = 10;

    const clearResumeAutoFollowTimer = useCallback(() => {
        if (resumeAutoFollowTimerRef.current) {
            clearTimeout(resumeAutoFollowTimerRef.current);
            resumeAutoFollowTimerRef.current = null;
        }
    }, []);

    const scheduleAutoFollowResume = useCallback(() => {
        clearResumeAutoFollowTimer();
        autoFollowPausedUntilRef.current = Date.now() + 5000;
        resumeAutoFollowTimerRef.current = setTimeout(() => {
            resumeAutoFollowTimerRef.current = null;
        }, 5000);
    }, [clearResumeAutoFollowTimer]);

    // Initialize PixiJS once per GameRenderer; resize + restart RAF when engine/camera/renderer change.
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const width = Math.max(1, container.clientWidth || 1);
        const height = Math.max(1, container.clientHeight || 1);
        let cancelled = false;

        const startRenderLoop = () => {
            const renderLoop = () => {
                if (cancelled) return;
                // WASD / arrow key camera pan
                const keys = keysHeldRef.current;
                if (keys.size > 0) {
                    let dx = 0;
                    let dy = 0;
                    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= PAN_SPEED;
                    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += PAN_SPEED;
                    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= PAN_SPEED;
                    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += PAN_SPEED;
                    if (dx !== 0 || dy !== 0) {
                        camera.panBy(dx, dy);
                        autoFollowPausedUntilRef.current = Date.now() + 5000;
                    }
                }

                // Follow local player's unit
                const playerUnit = engine.getLocalPlayerUnit();
                if (playerUnit) {
                    camera.setFocusTarget(playerUnit.x, playerUnit.y, playerUnit.radius);
                    const debugPauseUntil = (window as unknown as { __minionBattlesDebugAutoFollowPausedUntil?: number })
                        .__minionBattlesDebugAutoFollowPausedUntil;
                    const isDebugAutoFollowPaused = typeof debugPauseUntil === 'number' && Date.now() < debugPauseUntil;
                    const isAutoFollowPaused = isDebugAutoFollowPaused || Date.now() < autoFollowPausedUntilRef.current;
                    if (!dragStateRef.current?.dragging && !isAutoFollowPaused) {
                        camera.centerOn(playerUnit.x, playerUnit.y, playerUnit.radius);
                    }
                }
                const targetingState = targetingStateRef?.current ?? null;
                renderer.render(engine, camera, targetingState as Parameters<GameRenderer['render']>[2]);
                rafRef.current = requestAnimationFrame(renderLoop);
            };
            rafRef.current = requestAnimationFrame(renderLoop);
        };

        if (!renderer.isInitialized()) {
            void renderer
                .init(canvas, width, height)
                .then(async () => {
                    if (cancelled) return;
                    await renderer.waitUntilBattleAssetGateForCanvas();
                    if (cancelled) return;
                    camera.setViewportSize(width, height);
                    startRenderLoop();
                })
                .catch((err) => {
                    console.error('[BattleCanvas] Pixi init failed', err);
                });
        } else {
            void (async () => {
                renderer.resize(width, height);
                await renderer.waitUntilBattleAssetGateForCanvas();
                if (cancelled) return;
                camera.setViewportSize(width, height);
                startRenderLoop();
            })();
        }

        return () => {
            cancelled = true;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            clearResumeAutoFollowTimer();
        };
    }, [engine, camera, renderer, targetingStateRef, clearResumeAutoFollowTimer]);

    // Handle resize — only when size crosses a threshold to avoid flicker from small layout changes
    const lastBucketRef = useRef({ wBucket: -1, hBucket: -1 });
    const WIDTH_THRESHOLDS = [400, 560, 720, 880, 1040, 1200, 1600];
    const HEIGHT_THRESHOLDS = [300, 420, 540, 660, 780, 900, 1200];
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        function getBucket(value: number, thresholds: number[]) {
            const i = thresholds.findIndex((t) => value <= t);
            return i >= 0 ? i : thresholds.length;
        }

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                const w = Math.round(width);
                const h = Math.round(height);
                if (w <= 0 || h <= 0) continue;
                const wBucket = getBucket(w, WIDTH_THRESHOLDS);
                const hBucket = getBucket(h, HEIGHT_THRESHOLDS);
                if (wBucket !== lastBucketRef.current.wBucket || hBucket !== lastBucketRef.current.hBucket) {
                    lastBucketRef.current = { wBucket, hBucket };
                    renderer.resize(w, h);
                    camera.setViewportSize(w, h);
                }
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [renderer, camera]);

    // WASD and arrow key camera movement
    useEffect(() => {
        const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
        const isTyping = () => {
            const el = document.activeElement;
            return (
                !!el &&
                (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)
            );
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isTyping()) return;
            if (movementKeys.has(e.code)) {
                e.preventDefault();
                keysHeldRef.current.add(e.code);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (movementKeys.has(e.code)) {
                e.preventDefault();
                keysHeldRef.current.delete(e.code);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            onCanvasRightClick?.(screenX, screenY);
        },
        [onCanvasRightClick],
    );

    const getScreenPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    };

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        const targetingState = targetingStateRef?.current as { selectedAbility?: unknown } | null;
        if (targetingState?.selectedAbility) return;

        const { x, y } = getScreenPoint(e);
        dragStateRef.current = {
            pointerId: e.pointerId,
            startX: x,
            startY: y,
            lastX: x,
            lastY: y,
            dragging: false,
        };
        suppressClickRef.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
    }, [targetingStateRef]);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        const { x, y } = getScreenPoint(e);
        onCanvasMouseMove?.(x, y);

        const state = dragStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;

        const engineState = engine.getLocalPlayerUnit();
        const playerUnit = engineState ? { x: engineState.x, y: engineState.y, radius: engineState.radius } : null;
        const dx = x - state.lastX;
        const dy = y - state.lastY;
        const movedEnough = Math.hypot(x - state.startX, y - state.startY) >= 4;

        if (!state.dragging && movedEnough) {
            state.dragging = true;
            suppressClickRef.current = true;
            clearResumeAutoFollowTimer();
        }

        if (state.dragging) {
            camera.panBy(-dx, -dy);
            if (playerUnit) {
                camera.setFocusTarget(playerUnit.x, playerUnit.y, playerUnit.radius);
            }
            autoFollowPausedUntilRef.current = Date.now() + 5000;
        }

        state.lastX = x;
        state.lastY = y;
    }, [camera, clearResumeAutoFollowTimer, engine, onCanvasMouseMove]);

    const endPointerInteraction = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        const state = dragStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;

        const wasDragging = state.dragging;
        dragStateRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }

        if (wasDragging) {
            scheduleAutoFollowResume();
        }
    }, [scheduleAutoFollowResume]);

    const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        const state = dragStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (state.dragging) {
            scheduleAutoFollowResume();
        }
    }, [scheduleAutoFollowResume]);

    const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            e.preventDefault();
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        onCanvasClick?.(screenX, screenY);
    }, [onCanvasClick]);

    return (
        <div
            ref={containerRef}
            className="min-h-0 w-full flex-1 overflow-hidden bg-dark-800 relative"
        >
            <canvas
                ref={canvasRef}
                className="w-full h-full block touch-none"
                style={{ touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointerInteraction}
                onPointerCancel={handlePointerCancel}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            />
        </div>
    );
}
