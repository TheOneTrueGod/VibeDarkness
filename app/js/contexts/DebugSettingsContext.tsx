import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { debugSettingsSnapshot } from '../debug/debugSettingsStore';

export interface DebugSettings {
    darkOverlayEnabled: boolean;
    godModeEnabled: boolean;
    superSpeedEnabled: boolean;
    setDarkOverlayEnabled: (value: boolean) => void;
    setGodModeEnabled: (value: boolean) => void;
    setSuperSpeedEnabled: (value: boolean) => void;
}

const DebugSettingsContext = createContext<DebugSettings>({
    darkOverlayEnabled: true,
    godModeEnabled: false,
    superSpeedEnabled: false,
    setDarkOverlayEnabled: () => {},
    setGodModeEnabled: () => {},
    setSuperSpeedEnabled: () => {},
});

export function useDebugSettings(): DebugSettings {
    return useContext(DebugSettingsContext);
}

export function DebugSettingsProvider({ children }: { children: React.ReactNode }) {
    const [darkOverlayEnabled, setDarkOverlayEnabled] = useState(true);
    const [godModeEnabled, setGodModeEnabled] = useState(false);
    const [superSpeedEnabled, setSuperSpeedEnabled] = useState(false);

    // Sync to non-React snapshot used by engine / renderer
    useEffect(() => {
        debugSettingsSnapshot.darkOverlayEnabled = darkOverlayEnabled;
    }, [darkOverlayEnabled]);

    useEffect(() => {
        debugSettingsSnapshot.godModeEnabled = godModeEnabled;
    }, [godModeEnabled]);

    const value = useMemo(
        () => ({
            darkOverlayEnabled,
            godModeEnabled,
            superSpeedEnabled,
            setDarkOverlayEnabled,
            setGodModeEnabled,
            setSuperSpeedEnabled,
        }),
        [darkOverlayEnabled, godModeEnabled, superSpeedEnabled],
    );

    return <DebugSettingsContext.Provider value={value}>{children}</DebugSettingsContext.Provider>;
}
