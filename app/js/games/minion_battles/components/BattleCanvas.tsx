/**
 * BattleCanvas - PixiJS canvas wrapper for the battle phase.
 *
 * Mounts a <canvas>, initializes the PixiJS Application and GameRenderer,
 * handles resize, and forwards mouse events for the targeting system.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { GameRenderer } from '../engine/GameRenderer';
import type { GameEngine } from '../engine/GameEngine';
import type { Camera } from '../engine/Camera';

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
    const initializedRef = useRef(false);
    const rafRef = useRef<number>(0);

    // Initialize PixiJS
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || initializedRef.current) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        initializedRef.current = true;
        renderer.init(canvas, width, height).then(() => {
            camera.setViewportSize(width, height);

            // Start render loop
            const renderLoop = () => {
                // Follow local player's unit
                const playerUnit = engine.getLocalPlayerUnit();
                if (playerUnit) {
                    camera.centerOn(playerUnit.x, playerUnit.y);
                }
                const targetingState = targetingStateRef?.current ?? null;
                renderer.render(engine, camera, targetingState as Parameters<GameRenderer['render']>[2]);
                rafRef.current = requestAnimationFrame(renderLoop);
            };
            rafRef.current = requestAnimationFrame(renderLoop);
        });

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [engine, camera, renderer, targetingStateRef]);

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

    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            onCanvasClick?.(screenX, screenY);
        },
        [onCanvasClick],
    );

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

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            onCanvasMouseMove?.(screenX, screenY);
        },
        [onCanvasMouseMove],
    );

    // Handle touch events for mobile
    const handleTouchEnd = useCallback(
        (e: React.TouchEvent<HTMLCanvasElement>) => {
            if (e.changedTouches.length === 0) return;
            const touch = e.changedTouches[0];
            const rect = e.currentTarget.getBoundingClientRect();
            const screenX = touch.clientX - rect.left;
            const screenY = touch.clientY - rect.top;
            onCanvasClick?.(screenX, screenY);
        },
        [onCanvasClick],
    );

    return (
        <div
            ref={containerRef}
            className="flex-1 relative bg-dark-800 overflow-hidden max-w-5xl mx-auto w-full min-h-0"
        >
            <canvas
                ref={canvasRef}
                className="w-full h-full block"
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onMouseMove={handleMouseMove}
                onTouchEnd={handleTouchEnd}
            />
        </div>
    );
}
