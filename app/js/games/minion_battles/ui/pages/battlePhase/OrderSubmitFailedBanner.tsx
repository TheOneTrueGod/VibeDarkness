import React from 'react';

interface OrderSubmitFailedBannerProps {
    onDismiss: () => void;
}

/** Dismissible banner shown when BattleNet silently drops a submitted order. */
export default function OrderSubmitFailedBanner({ onDismiss }: OrderSubmitFailedBannerProps) {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-lg ring-1 ring-red-700">
            <span>Your order was not accepted — please re-issue your turn.</span>
            <button
                className="ml-2 text-red-400 hover:text-red-200"
                onClick={onDismiss}
                aria-label="Dismiss"
            >
                ✕
            </button>
        </div>
    );
}
