import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
    debugSettingsSnapshot,
    requestDebugAdvanceTicks,
    DEFAULT_ENEMY_MOVEMENT_TRAIL_LIMIT,
    type EnemyMovementTrailLimit,
} from '../debug/debugSettingsStore';

export interface DebugSettings {
    darkOverlayEnabled: boolean;
    godModeEnabled: boolean;
    superSpeedEnabled: boolean;
    debugPauseMode: boolean;
    logEveryTick: boolean;
    jsPerformanceTracking: boolean;
    enemyMovementTrailLimit: EnemyMovementTrailLimit;
    setDarkOverlayEnabled: (value: boolean) => void;
    setGodModeEnabled: (value: boolean) => void;
    setSuperSpeedEnabled: (value: boolean) => void;
    setDebugPauseMode: (value: boolean) => void;
    setLogEveryTick: (value: boolean) => void;
    setJsPerformanceTracking: (value: boolean) => void;
    setEnemyMovementTrailLimit: (value: EnemyMovementTrailLimit) => void;
    advanceOneDebugTick: () => void;
}

const DebugSettingsContext = createContext<DebugSettings>({
    darkOverlayEnabled: true,
    godModeEnabled: false,
    superSpeedEnabled: false,
    debugPauseMode: false,
    logEveryTick: false,
    jsPerformanceTracking: false,
    enemyMovementTrailLimit: DEFAULT_ENEMY_MOVEMENT_TRAIL_LIMIT,
    setDarkOverlayEnabled: () => {},
    setGodModeEnabled: () => {},
    setSuperSpeedEnabled: () => {},
    setDebugPauseMode: () => {},
    setLogEveryTick: () => {},
    setJsPerformanceTracking: () => {},
    setEnemyMovementTrailLimit: () => {},
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
    const [jsPerformanceTracking, setJsPerformanceTracking] = useState(false);
    const [enemyMovementTrailLimit, setEnemyMovementTrailLimit] = useState<EnemyMovementTrailLimit>(
        DEFAULT_ENEMY_MOVEMENT_TRAIL_LIMIT,
    );

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

    useEffect(() => {
        debugSettingsSnapshot.jsPerformanceTracking = jsPerformanceTracking;
    }, [jsPerformanceTracking]);

    useEffect(() => {
        debugSettingsSnapshot.enemyMovementTrailLimit = enemyMovementTrailLimit;
    }, [enemyMovementTrailLimit]);

    const value = useMemo(
        () => ({
            darkOverlayEnabled,
            godModeEnabled,
            superSpeedEnabled,
            debugPauseMode,
            logEveryTick,
            jsPerformanceTracking,
            enemyMovementTrailLimit,
            setDarkOverlayEnabled,
            setGodModeEnabled,
            setSuperSpeedEnabled,
            setDebugPauseMode,
            setLogEveryTick,
            setJsPerformanceTracking,
            setEnemyMovementTrailLimit,
            advanceOneDebugTick: () => requestDebugAdvanceTicks(1),
        }),
        [darkOverlayEnabled, godModeEnabled, superSpeedEnabled, debugPauseMode, logEveryTick, jsPerformanceTracking, enemyMovementTrailLimit],
    );

    return <DebugSettingsContext.Provider value={value}>{children}</DebugSettingsContext.Provider>;
}
