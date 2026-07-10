/**
 * Player name chip for the battle timeline — tiny label or full row with order/WebRTC status.
 */
import React, { useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import type { PlayerState } from '../../../../types';
import { AnchoredPortalTooltip } from './AnchoredPortalTooltip';
import {
    playerTileIndicatorTooltip,
    type PlayerTileIndicatorColor,
} from './playerTileIndicator';

export type PlayerTileVariant = 'tiny' | 'small';

const INDICATOR_FILL: Record<PlayerTileIndicatorColor, string> = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
};

export interface PlayerTileProps {
    player: PlayerState;
    variant: PlayerTileVariant;
    /** Order-sync lamp (small variant only). */
    indicatorColor?: PlayerTileIndicatorColor;
    /**
     * When defined, show WebRTC connected/disconnected on the right (small variant).
     * Local callers should pass true for the local player. Omit when WebRTC mesh is inactive (e.g. solo).
     */
    webRtcConnected?: boolean;
}

function IndicatorLamp({
    color,
}: {
    color: PlayerTileIndicatorColor;
}) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    const tip = playerTileIndicatorTooltip(color);

    return (
        <>
            <span
                ref={anchorRef}
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black ${INDICATOR_FILL[color]}`}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                aria-label={tip.title}
            />
            <AnchoredPortalTooltip
                anchorRef={anchorRef}
                open={open}
                placement="right"
                className="max-w-[220px] rounded border border-white bg-black px-2.5 py-2 text-left shadow-lg"
            >
                <div className="text-xs font-semibold text-white">{tip.title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-white">{tip.description}</div>
            </AnchoredPortalTooltip>
        </>
    );
}

export default function PlayerTile({
    player,
    variant,
    indicatorColor = 'green',
    webRtcConnected,
}: PlayerTileProps) {
    if (variant === 'tiny') {
        return (
            <div
                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold"
                style={{
                    borderColor: player.color,
                    backgroundColor: `${player.color}22`,
                }}
                title={player.name}
            >
                <span className="min-w-0 truncate" style={{ color: player.color }}>
                    {player.name}
                </span>
                {player.isHost && (
                    <span className="shrink-0 text-[10px] font-bold text-primary">(HOST)</span>
                )}
            </div>
        );
    }

    return (
        <div
            className="flex min-h-[1.75rem] w-full min-w-0 items-center gap-2 rounded border px-2 py-1"
            style={{
                borderColor: player.color,
                backgroundColor: `${player.color}18`,
            }}
        >
            <IndicatorLamp color={indicatorColor} />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-100" title={player.name}>
                <span style={{ color: player.color }}>{player.name}</span>
                {player.isHost && (
                    <span className="ml-1 text-[10px] font-bold text-primary">(HOST)</span>
                )}
            </span>
            {webRtcConnected !== undefined && (
                <span
                    className="shrink-0 text-gray-300"
                    title={webRtcConnected ? 'WebRTC connected' : 'WebRTC disconnected'}
                    aria-label={webRtcConnected ? 'WebRTC connected' : 'WebRTC disconnected'}
                >
                    {webRtcConnected ? (
                        <Wifi className="h-3.5 w-3.5" strokeWidth={2.25} />
                    ) : (
                        <WifiOff className="h-3.5 w-3.5 text-red-400" strokeWidth={2.25} />
                    )}
                </span>
            )}
        </div>
    );
}
