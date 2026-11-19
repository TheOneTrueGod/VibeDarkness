import React from 'react';
interface RewindOverlayProps {
    overlay: { frameUrl: string; token: number; fadeMs: number };
    opaque: boolean;
}

/** Frozen-frame overlay while sequential targeting rolls back (DOM, not Pixi). */
export default function RewindOverlay({ overlay, opaque }: RewindOverlayProps) {
    return (
        <div
            key={overlay.token}
            className="pointer-events-none absolute inset-0 z-40 transition-opacity ease-out"
            style={{
                opacity: opaque ? 1 : 0,
                transitionDuration: `${overlay.fadeMs}ms`,
            }}
            aria-hidden
        >
            {overlay.frameUrl ? (
                <img
                    src={overlay.frameUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-fill"
                    draggable={false}
                />
            ) : (
                <div className="absolute inset-0 bg-dark-900" />
            )}
        </div>
    );
}
