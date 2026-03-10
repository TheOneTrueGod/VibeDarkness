export interface DebugSettingsSnapshot {
    /** When false, darkness overlay on the battle map is disabled. */
    darkOverlayEnabled: boolean;
    /** When true, player-controlled units do not lose HP. */
    godModeEnabled: boolean;
    /** When true, player-controlled units move much faster. */
    superSpeedEnabled: boolean;
}

export const debugSettingsSnapshot: DebugSettingsSnapshot = {
    darkOverlayEnabled: true,
    godModeEnabled: false,
    superSpeedEnabled: false,
};
