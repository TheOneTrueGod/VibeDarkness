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
                renderer.render(engine, camera);
                rafRef.current = requestAnimationFrame(renderLoop);
            };
            rafRef.current = requestAnimationFrame(renderLoop);
        });

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [engine, camera, renderer]);

    // Handle resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    renderer.resize(width, height);
                    camera.setViewportSize(width, height);
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
        <div ref={containerRef} className="flex-1 relative bg-dark-800 overflow-hidden">
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
