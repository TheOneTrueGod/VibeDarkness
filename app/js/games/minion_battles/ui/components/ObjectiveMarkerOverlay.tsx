import React, { useEffect, useRef, useMemo } from 'react';
import type { GameEngine } from '../../game/GameEngine';
import type { Camera } from '../../game/Camera';
import type { BattleObjectiveDef } from '../../storylines/types';
import { UnitTag } from '../../game/units/unitTag';

interface ObjectiveMarkerOverlayProps {
    engine: GameEngine;
    camera: Camera;
    battleObjectives: BattleObjectiveDef[];
}

const ICON_HALF_W = 6;  // approx half-width of "!" at 36px bold
const ICON_HALF_H = 18; // approx half-height
const FADE_START_PX = 200;
const FADE_END_PX = 150;
const EDGE_PADDING = 28;

export default function ObjectiveMarkerOverlay({
    engine,
    camera,
    battleObjectives,
}: ObjectiveMarkerOverlayProps) {
    const markersWithConfig = useMemo(
        () => battleObjectives.filter((obj) => obj.showObjectiveMarker?.enable),
        [battleObjectives],
    );

    const markerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

    useEffect(() => {
        if (markersWithConfig.length === 0) return;

        let rafId: number;

        const update = () => {
            const localUnit = engine.getLocalPlayerUnit();
            const completedIds = new Set(
                engine.getBattleObjectiveRows()
                    .filter((r) => r.completed)
                    .map((r) => r.id),
            );

            for (const obj of markersWithConfig) {
                const el = markerRefs.current.get(obj.id);
                if (!el) continue;

                if (completedIds.has(obj.id)) {
                    el.style.display = 'none';
                    continue;
                }

                const markerConfig = obj.showObjectiveMarker!;
                let targetX: number;
                let targetY: number;
                let displayY: number;

                if (markerConfig.target.type === 'position') {
                    targetX = markerConfig.target.x;
                    targetY = markerConfig.target.y;
                    displayY = targetY;
                } else {
                    const unit = engine.units.find(
                        (u) => u.isAlive() && u.tags.includes((markerConfig.target as { tag: UnitTag }).tag),
                    );
                    if (!unit) {
                        el.style.display = 'none';
                        continue;
                    }
                    targetX = unit.x;
                    targetY = unit.y;
                    displayY = unit.y - unit.radius - 20;
                }

                el.style.display = '';

                // Proximity opacity — distance from local player to the actual target world position
                let opacity = 1;
                if (localUnit) {
                    const dx = localUnit.x - targetX;
                    const dy = localUnit.y - targetY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= FADE_END_PX) {
                        opacity = 0;
                    } else if (dist < FADE_START_PX) {
                        opacity = (dist - FADE_END_PX) / (FADE_START_PX - FADE_END_PX);
                    }
                }

                if (opacity === 0) {
                    el.style.opacity = '0';
                    continue;
                }

                const screen = camera.worldToScreen(targetX, displayY);
                const vw = camera.viewportWidth;
                const vh = camera.viewportHeight;

                const onScreen =
                    screen.x >= 0 && screen.x <= vw && screen.y >= 0 && screen.y <= vh;

                let finalX: number;
                let finalY: number;

                if (onScreen) {
                    finalX = screen.x - ICON_HALF_W;
                    finalY = screen.y - ICON_HALF_H;
                } else if (markerConfig.showOffscreen) {
                    // Clamp to viewport edge: project the ray from center through the target screen pos
                    const cx = vw / 2;
                    const cy = vh / 2;
                    const dx = screen.x - cx;
                    const dy = screen.y - cy;
                    if (dx === 0 && dy === 0) {
                        finalX = cx - ICON_HALF_W;
                        finalY = EDGE_PADDING - ICON_HALF_H;
                    } else {
                        const maxX = cx - EDGE_PADDING;
                        const maxY = cy - EDGE_PADDING;
                        const scaleX = maxX / Math.abs(dx);
                        const scaleY = maxY / Math.abs(dy);
                        const scale = Math.min(scaleX, scaleY);
                        finalX = cx + dx * scale - ICON_HALF_W;
                        finalY = cy + dy * scale - ICON_HALF_H;
                    }
                } else {
                    el.style.display = 'none';
                    continue;
                }

                el.style.left = `${finalX}px`;
                el.style.top = `${finalY}px`;
                el.style.opacity = String(opacity);
            }

            rafId = requestAnimationFrame(update);
        };

        rafId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafId);
    }, [engine, camera, markersWithConfig]);

    if (markersWithConfig.length === 0) return null;

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {markersWithConfig.map((obj) => (
                <div
                    key={obj.id}
                    ref={(el) => {
                        markerRefs.current.set(obj.id, el);
                    }}
                    className="absolute animate-pulse select-none"
                    style={{
                        willChange: 'left, top, opacity',
                        color: '#facc15',
                        fontSize: '36px',
                        fontWeight: 900,
                        lineHeight: 1,
                        textShadow: '0 0 8px rgba(250, 204, 21, 0.9), 0 0 16px rgba(250, 204, 21, 0.5)',
                        fontFamily: 'sans-serif',
                    }}
                >
                    !
                </div>
            ))}
        </div>
    );
}
