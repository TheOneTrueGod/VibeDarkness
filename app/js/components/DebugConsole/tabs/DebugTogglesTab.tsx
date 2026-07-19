/**
 * Debug toggles — persisted client flags (localStorage). Add new rows as checkboxes; layout is two columns.
 */
import React, { useCallback, useSyncExternalStore } from 'react';
import { useDebugSettings } from '../../../contexts/DebugSettingsContext';
import DebugOnOffButton from '../DebugOnOffButton';
import {
    DEBUG_TYPES,
    DEBUG_LOG_THRESHOLD_LABELS,
    DEBUG_TYPE_LABELS,
    type DebugLogThreshold,
    debugLogState,
} from '../../../debugLog';
import {
    getShowAllResearchTrees,
    getAlwaysShowSyncStatus,
    getShowGameTick,
    setShowAllResearchTrees,
    setAlwaysShowSyncStatus,
    setShowGameTick,
    subscribeShowAllResearchTrees,
    subscribeAlwaysShowSyncStatus,
    subscribeShowGameTick,
    getUserStateLogging,
    setUserStateLogging,
    subscribeUserStateLogging,
    getResourceBarDebugEnabled,
    setResourceBarDebugEnabled,
    getResourceBarDebugFill,
    setResourceBarDebugFill,
    subscribeResourceBarDebug,
} from '../../../debugFlags';
import {
    LOBBY_LOG_TYPES,
    LOBBY_LOG_TYPE_LABELS,
    lobbyLogPostThresholdState,
} from '../../../lobbyLogPostThresholds';
import {
    RENDER_LAYER_IDS,
    RENDER_LAYER_LABELS,
    type RenderLayerId,
    getRenderVisibilitySnapshot,
    setRenderLayerVisible,
    subscribeRenderVisibility,
} from '../../../debug/renderVisibilityStore';

interface DebugTogglesTabProps {
    isActive: boolean;
}

const THRESHOLD_OPTIONS = (
    Object.keys(DEBUG_LOG_THRESHOLD_LABELS) as DebugLogThreshold[]
).map((value) => ({ value, label: DEBUG_LOG_THRESHOLD_LABELS[value] }));

export default function DebugTogglesTab({ isActive }: DebugTogglesTabProps) {
    const {
        logEveryTick,
        setLogEveryTick,
        jsPerformanceTracking,
        setJsPerformanceTracking,
        darkOverlayEnabled,
        setDarkOverlayEnabled,
    } = useDebugSettings();

    const showAllResearchTrees = useSyncExternalStore(
        subscribeShowAllResearchTrees,
        getShowAllResearchTrees,
        getShowAllResearchTrees,
    );

    const alwaysShowSyncStatus = useSyncExternalStore(
        subscribeAlwaysShowSyncStatus,
        getAlwaysShowSyncStatus,
        getAlwaysShowSyncStatus,
    );

    const showGameTick = useSyncExternalStore(
        subscribeShowGameTick,
        getShowGameTick,
        getShowGameTick,
    );

    const userStateLogging = useSyncExternalStore(
        subscribeUserStateLogging,
        getUserStateLogging,
        getUserStateLogging,
    );

    const resourceBarDebugEnabled = useSyncExternalStore(
        subscribeResourceBarDebug,
        getResourceBarDebugEnabled,
        getResourceBarDebugEnabled,
    );

    const resourceBarDebugFill = useSyncExternalStore(
        subscribeResourceBarDebug,
        getResourceBarDebugFill,
        getResourceBarDebugFill,
    );

    const subscribeDebugLog = useCallback((onStoreChange: () => void) => debugLogState.subscribe(onStoreChange), []);

    const getDebugLogSnapshot = useCallback(
        () => DEBUG_TYPES.map((t) => `${t}:${debugLogState.getThreshold(t)}`).join('|'),
        [],
    );

    useSyncExternalStore(subscribeDebugLog, getDebugLogSnapshot, getDebugLogSnapshot);

    const subscribeLobbyLogPost = useCallback(
        (onStoreChange: () => void) => lobbyLogPostThresholdState.subscribe(onStoreChange),
        [],
    );

    const getLobbyLogPostSnapshot = useCallback(
        () => LOBBY_LOG_TYPES.map((t) => `${t}:${lobbyLogPostThresholdState.getThreshold(t)}`).join('|'),
        [],
    );

    useSyncExternalStore(subscribeLobbyLogPost, getLobbyLogPostSnapshot, getLobbyLogPostSnapshot);

    const renderVisibility = useSyncExternalStore(
        subscribeRenderVisibility,
        getRenderVisibilitySnapshot,
        getRenderVisibilitySnapshot,
    );

    if (!isActive) return null;

    return (
        <div className="text-sm text-white">
            <p className="text-xs text-muted mb-4 max-w-xl">
                These options persist in this browser. Use them for layout and visibility debugging; they are not synced to the server.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 items-start">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={showAllResearchTrees}
                        onChange={(e) => setShowAllResearchTrees(e.target.checked)}
                    />
                    <span className="leading-snug">Show all research trees</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={alwaysShowSyncStatus}
                        onChange={(e) => setAlwaysShowSyncStatus(e.target.checked)}
                    />
                    <span className="leading-snug">Always show sync status</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={showGameTick}
                        onChange={(e) => setShowGameTick(e.target.checked)}
                    />
                    <span className="leading-snug">Show game tick</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={logEveryTick}
                        onChange={(e) => setLogEveryTick(e.target.checked)}
                    />
                    <span className="leading-snug">Console log every tick</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={jsPerformanceTracking}
                        onChange={(e) => setJsPerformanceTracking(e.target.checked)}
                    />
                    <span className="leading-snug">JS performance tracking</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={userStateLogging}
                        onChange={(e) => setUserStateLogging(e.target.checked)}
                    />
                    <span className="leading-snug">Log user state to server</span>
                </label>
            </div>
            {jsPerformanceTracking && (
                <p className="text-xs text-muted mt-2 max-w-xl">
                    Attaches a nested <code className="text-muted">performanceLog</code> (ms for the last game
                    tick) on serialized game state when logging ticks or saving snapshots.
                </p>
            )}

            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mt-8 mb-2">
                Resource bars
            </h3>
            <p className="text-xs text-muted mb-3 max-w-xl">
                Override resource display in the battle HUD. When enabled, all resource types are shown at the specified fill level regardless of actual values.
            </p>
            <div className="flex flex-col gap-3 max-w-lg">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={resourceBarDebugEnabled}
                        onChange={(e) => setResourceBarDebugEnabled(e.target.checked)}
                    />
                    <span className="leading-snug">Override resource fill</span>
                </label>
                <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">Fill amount</span>
                        <span className="text-xs tabular-nums text-white">{resourceBarDebugFill}%</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={resourceBarDebugFill}
                        disabled={!resourceBarDebugEnabled}
                        onChange={(e) => setResourceBarDebugFill(Number(e.target.value))}
                        className="w-full accent-primary disabled:opacity-40"
                    />
                </label>
            </div>

            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mt-8 mb-2">
                RENDER VISIBILITY
            </h3>
            <p className="text-xs text-muted mb-3 max-w-xl">
                Toggle battle canvas render layers on or off. All layers start visible; settings reset when you
                refresh the page.
            </p>
            <div className="flex items-center gap-2 mb-3">
                <span>Darkness layer</span>
                <DebugOnOffButton
                    enabled={darkOverlayEnabled}
                    onToggle={() => setDarkOverlayEnabled(!darkOverlayEnabled)}
                    onLabel="On"
                    offLabel="Off"
                />
                <span className="text-[11px] text-muted">
                    When off, hides the light/darkness overlay and reveals all enemy units and their ability previews,
                    regardless of darkness.
                </span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 items-start">
                {RENDER_LAYER_IDS.map((layerId) => (
                    <label key={layerId} className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                            checked={renderVisibility[layerId]}
                            onChange={(e) => setRenderLayerVisible(layerId as RenderLayerId, e.target.checked)}
                        />
                        <span className="leading-snug">{RENDER_LAYER_LABELS[layerId]}</span>
                    </label>
                ))}
            </div>

            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mt-8 mb-2">Debug logging</h3>
            <p className="text-xs text-muted mb-3 max-w-xl">
                Print up to the chosen severity: only that level and more severe messages appear in the console (e.g.&nbsp;&quot;Warn
                and above&quot; hides log and info).
            </p>
            <div className="flex flex-col gap-3 max-w-lg">
                {DEBUG_TYPES.map((type) => (
                    <label key={type} className="flex flex-col gap-1">
                        <span className="text-xs text-muted">{DEBUG_TYPE_LABELS[type]}</span>
                        <select
                            className="rounded border border-border-custom bg-surface px-2 py-1.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={debugLogState.getThreshold(type)}
                            onChange={(e) => {
                                debugLogState.setThreshold(type, e.target.value as DebugLogThreshold);
                            }}
                        >
                            {THRESHOLD_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ))}
            </div>

            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mt-8 mb-2">
                Persisted lobby log (server)
            </h3>
            <p className="text-xs text-muted mb-3 max-w-xl">
                Severity floor per category for POSTing lines to <code className="text-muted">lobby_log.jsonl</code>.
                Only messages at or above the chosen level are sent (same ordering as debug logging above).
            </p>
            <div className="flex flex-col gap-3 max-w-lg">
                {LOBBY_LOG_TYPES.map((type) => (
                    <label key={type} className="flex flex-col gap-1">
                        <span className="text-xs text-muted">{LOBBY_LOG_TYPE_LABELS[type]}</span>
                        <select
                            className="rounded border border-border-custom bg-surface px-2 py-1.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={lobbyLogPostThresholdState.getThreshold(type)}
                            onChange={(e) => {
                                lobbyLogPostThresholdState.setThreshold(type, e.target.value as DebugLogThreshold);
                            }}
                        >
                            {THRESHOLD_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ))}
            </div>
        </div>
    );
}
