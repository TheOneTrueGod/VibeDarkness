/**
 * Compact header control that opens the debug drawer.
 */
import React from 'react';
import { Bug } from 'lucide-react';
import { useDebugConsole } from '../../contexts/DebugConsoleContext';
import { TestIds } from '../../testing/testIds';

const DEBUG_CONSOLE_TOGGLE_SIZE_PX = 26;
const DEBUG_CONSOLE_TOGGLE_ICON_SIZE_PX = 14;

const TOGGLE_CLASS =
    'flex items-center justify-center shrink-0 rounded-md border border-border-custom bg-surface text-white hover:bg-border-custom transition-colors';

export default function DebugConsoleToggle() {
    const { debugConsoleEnabled, debugConsoleExpanded, setDebugConsoleExpanded } = useDebugConsole();
    if (!debugConsoleEnabled) return null;

    return (
        <button
            type="button"
            data-testid={TestIds.debugConsoleToggle}
            className={TOGGLE_CLASS}
            style={{ width: DEBUG_CONSOLE_TOGGLE_SIZE_PX, height: DEBUG_CONSOLE_TOGGLE_SIZE_PX }}
            aria-expanded={debugConsoleExpanded}
            aria-label="Debug console"
            title="Debug"
            onClick={() => setDebugConsoleExpanded(!debugConsoleExpanded)}
        >
            <Bug size={DEBUG_CONSOLE_TOGGLE_ICON_SIZE_PX} aria-hidden />
        </button>
    );
}
