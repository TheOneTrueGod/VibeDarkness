import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Application } from 'pixi.js';
import type { GameEngine } from '../../game/GameEngine';
import type { HudEffect } from '../../game/effects/HudEffect';
import { HudEffectLayer } from '../../game/GameRenderer/renderers/HudEffectLayer';

export interface HudEffectCanvasHandle {
    addHudEffect(effect: HudEffect): void;
    registerHudFlightTarget(key: string, pageX: number, pageY: number): void;
    unregisterHudFlightTarget(key: string): void;
}

interface HudEffectCanvasProps {
    engine: GameEngine;
}

/**
 * Full-viewport transparent canvas at z-30 (above all React UI). pointer-events-none.
 * HUD effects (particles, screen flash, banners) render here so they appear over the
 * sidebar and AbilityBar — not just within the game canvas bounds.
 *
 * Uses a separate PixiJS Application from the game canvas (separate WebGL context).
 * autoStart:false prevents PixiJS from running its own ticker; we call app.render()
 * manually each frame so we control exactly when the stage flushes to screen.
 * Canvas is created programmatically to give each effect invocation a fresh element
 * (prevents React Strict Mode double-init from sharing a single canvas).
 */
const HudEffectCanvas = forwardRef<HudEffectCanvasHandle, HudEffectCanvasProps>(
    function HudEffectCanvas({ engine }, ref) {
        const containerRef = useRef<HTMLDivElement>(null);
        const engineRef = useRef(engine);
        engineRef.current = engine;

        const stateRef = useRef<{
            app: Application;
            layer: HudEffectLayer;
            hudTargets: Map<string, { x: number; y: number }>;
            canvas: HTMLCanvasElement;
            rafId: number;
        } | null>(null);

        useImperativeHandle(ref, () => ({
            addHudEffect(effect: HudEffect) {
                stateRef.current?.layer.addEffect(effect);
            },
            registerHudFlightTarget(key: string, pageX: number, pageY: number) {
                stateRef.current?.hudTargets.set(key, { x: pageX, y: pageY });
            },
            unregisterHudFlightTarget(key: string) {
                stateRef.current?.hudTargets.delete(key);
            },
        }));

        useEffect(() => {
            const wrapper = containerRef.current;
            if (!wrapper) return;

            // Fresh canvas element per invocation — prevents Strict Mode double-init
            // from reusing the same canvas and corrupting the WebGL context.
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.display = 'block';
            wrapper.appendChild(canvas);

            let cancelled = false;
            const hudTargets = new Map<string, { x: number; y: number }>();
            const app = new Application();

            void app.init({
                canvas,
                width: window.innerWidth,
                height: window.innerHeight,
                backgroundAlpha: 0,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                // Disable PixiJS's built-in ticker so it doesn't fight with our RAF loop
                // or the game canvas Application's ticker.
                autoStart: false,
            }).then(() => {
                if (cancelled) {
                    app.destroy();
                    canvas.remove();
                    return;
                }

                const layer = new HudEffectLayer(app.stage, hudTargets);
                let lastTs = 0;
                const loop = (ts: number) => {
                    if (cancelled) return;
                    const realDt = lastTs > 0 ? Math.min((ts - lastTs) / 1000, 0.1) : 0;
                    lastTs = ts;
                    layer.render(engineRef.current, window.innerWidth, window.innerHeight, realDt);
                    app.render();
                    const s = stateRef.current;
                    if (s) s.rafId = requestAnimationFrame(loop);
                };

                const rafId = requestAnimationFrame(loop);
                stateRef.current = { app, layer, hudTargets, canvas, rafId };
            });

            const onResize = () => {
                stateRef.current?.app.renderer.resize(window.innerWidth, window.innerHeight);
            };
            window.addEventListener('resize', onResize);

            return () => {
                cancelled = true;
                window.removeEventListener('resize', onResize);
                const s = stateRef.current;
                if (s) {
                    cancelAnimationFrame(s.rafId);
                    s.layer.destroy();
                    s.app.destroy();
                    s.canvas.remove();
                    stateRef.current = null;
                }
                // If init is still in flight, .then() will clean up the canvas when it resolves.
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        return (
            <div
                ref={containerRef}
                className="fixed inset-0 z-30 pointer-events-none"
                aria-hidden="true"
            />
        );
    }
);

export default HudEffectCanvas;
