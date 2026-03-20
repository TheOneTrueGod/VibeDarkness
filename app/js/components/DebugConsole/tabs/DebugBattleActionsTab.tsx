import React from 'react';
import { useDebugSettings } from '../../../contexts/DebugSettingsContext';
import DebugOnOffButton from '../DebugOnOffButton';

interface DebugBattleActionsTabProps {
    isActive: boolean;
    inBattle: boolean;
    isAdmin: boolean;
    isHost?: boolean;
    skipCurrentTurn?: (() => void) | null;
}

export default function DebugBattleActionsTab({ isActive, inBattle, isAdmin, isHost = false, skipCurrentTurn = null }: DebugBattleActionsTabProps) {
    const { darkOverlayEnabled, godModeEnabled, superSpeedEnabled, setDarkOverlayEnabled, setGodModeEnabled, setSuperSpeedEnabled } =
        useDebugSettings();

    if (!isActive || !inBattle || !isAdmin) return null;

    return (
        <div className="flex flex-col gap-2 text-sm text-muted">
            {isHost && skipCurrentTurn && (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="px-3 py-2 bg-warning text-secondary text-xs font-medium rounded hover:bg-warning/80 transition-colors"
                        onClick={skipCurrentTurn}
                    >
                        Skip current turn
                    </button>
                    <span className="text-[11px] text-muted">Host only: applies a wait order for the current unit.</span>
                </div>
            )}
            <div className="flex items-center gap-2">
                <span>Darkness layer</span>
                <DebugOnOffButton
                    enabled={darkOverlayEnabled}
                    onToggle={() => setDarkOverlayEnabled(!darkOverlayEnabled)}
                    onLabel="On"
                    offLabel="Off"
                />
                <span className="text-[11px] text-muted">When off, the battle map hides the light/darkness overlay.</span>
            </div>

            <div className="flex items-center gap-2">
                <span>God mode</span>
                <DebugOnOffButton enabled={godModeEnabled} onToggle={() => setGodModeEnabled(!godModeEnabled)} onLabel="On" offLabel="Off" />
                <span className="text-[11px] text-muted">Player-controlled units do not lose HP while enabled.</span>
            </div>

            <div className="flex items-center gap-2">
                <span>Super Speed</span>
                <DebugOnOffButton
                    enabled={superSpeedEnabled}
                    onToggle={() => setSuperSpeedEnabled(!superSpeedEnabled)}
                    onLabel="On"
                    offLabel="Off"
                />
                <span className="text-[11px] text-muted">Player-controlled units move 10x faster while enabled.</span>
            </div>
        </div>
    );
}

