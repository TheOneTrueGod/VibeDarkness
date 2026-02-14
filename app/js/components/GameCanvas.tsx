/**
 * Game canvas with click tracking and marker display
 */
import React, { useRef, useCallback } from 'react';

export interface ClickData {
    playerId: string;
    playerName: string;
    color: string;
    x: number;
    y: number;
}

interface GameCanvasProps {
    clicks: Record<string, ClickData>;
    onCanvasClick: (x: number, y: number) => void;
}

export default function GameCanvas({ clicks, onCanvasClick }: GameCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            onCanvasClick(x, y);
        },
        [onCanvasClick]
    );

    return (
        <div
            ref={containerRef}
            className="flex-1 relative bg-surface rounded-lg overflow-hidden cursor-crosshair"
            onClick={handleClick}
        >
            <canvas className="w-full h-full" />
            <div className="absolute inset-0 pointer-events-none">
                {Object.entries(clicks).map(([id, click]) => (
                    <div
                        key={id}
                        className="click-marker absolute w-6 h-6 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300"
                        style={{
                            left: `${click.x}%`,
                            top: `${click.y}%`,
                            backgroundColor: click.color,
                            color: click.color,
                            boxShadow: `0 0 10px ${click.color}`,
                        }}
                        data-name={click.playerName}
                    />
                ))}
            </div>
        </div>
    );
}
