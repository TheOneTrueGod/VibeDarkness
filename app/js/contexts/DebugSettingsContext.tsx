import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { debugSettingsSnapshot, requestDebugAdvanceTicks } from '../debug/debugSettingsStore';

export interface DebugSettings {
    darkOverlayEnabled: boolean;
    godModeEnabled: boolean;
    superSpeedEnabled: boolean;
    debugPauseMode: boolean;
    logEveryTick: boolean;
    setDarkOverlayEnabled: (value: boolean) => void;
    setGodModeEnabled: (value: boolean) => void;
    setSuperSpeedEnabled: (value: boolean) => void;
    setDebugPauseMode: (value: boolean) => void;
    setLogEveryTick: (value: boolean) => void;
    advanceOneDebugTick: () => void;
}

const DebugSettingsContext = createContext<DebugSettings>({
    darkOverlayEnabled: true,
    godModeEnabled: false,
    superSpeedEnabled: false,
    debugPauseMode: false,
    logEveryTick: false,
    setDarkOverlayEnabled: () => {},
    setGodModeEnabled: () => {},
    setSuperSpeedEnabled: () => {},
    setDebugPauseMode: () => {},
    setLogEveryTick: () => {},
    advanceOneDebugTick: () => {},
});

export function useDebugSettings(): DebugSettings {
    return useContext(DebugSettingsContext);
}

export function DebugSettingsProvider({ children }: { children: React.ReactNode }) {
    const [darkOverlayEnabled, setDarkOverlayEnabled] = useState(true);
    const [godModeEnabled, setGodModeEnabled] = useState(false);
    const [superSpeedEnabled, setSuperSpeedEnabled] = useState(false);
    const [debugPauseMode, setDebugPauseMode] = useState(false);
    const [logEveryTick, setLogEveryTick] = useState(false);

    // Sync to non-React snapshot used by engine / renderer
    useEffect(() => {
        debugSettingsSnapshot.darkOverlayEnabled = darkOverlayEnabled;
    }, [darkOverlayEnabled]);

    useEffect(() => {
        debugSettingsSnapshot.godModeEnabled = godModeEnabled;
    }, [godModeEnabled]);

    useEffect(() => {
        debugSettingsSnapshot.superSpeedEnabled = superSpeedEnabled;
    }, [superSpeedEnabled]);

    useEffect(() => {
        debugSettingsSnapshot.debugPauseMode = debugPauseMode;
        if (!debugPauseMode) {
            debugSettingsSnapshot.debugAdvanceTicksRequested = 0;
        }
    }, [debugPauseMode]);

    useEffect(() => {
        debugSettingsSnapshot.logEveryTick = logEveryTick;
    }, [logEveryTick]);

    const value = useMemo(
        () => ({
            darkOverlayEnabled,
            godModeEnabled,
            superSpeedEnabled,
            debugPauseMode,
            logEveryTick,
            setDarkOverlayEnabled,
            setGodModeEnabled,
            setSuperSpeedEnabled,
            setDebugPauseMode,
            setLogEveryTick,
            advanceOneDebugTick: () => requestDebugAdvanceTicks(1),
        }),
        [darkOverlayEnabled, godModeEnabled, superSpeedEnabled, debugPauseMode, logEveryTick],
    );

    return <DebugSettingsContext.Provider value={value}>{children}</DebugSettingsContext.Provider>;
}
