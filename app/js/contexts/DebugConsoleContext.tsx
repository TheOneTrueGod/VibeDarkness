import React, { createContext, useContext, useMemo, useState } from 'react';

interface DebugConsoleContextValue {
    selectedDebugUnitId: string | null;
    setSelectedDebugUnitId: (id: string | null) => void;
}

const DebugConsoleContext = createContext<DebugConsoleContextValue>({
    selectedDebugUnitId: null,
    setSelectedDebugUnitId: () => {},
});

export function useDebugConsole(): DebugConsoleContextValue {
    return useContext(DebugConsoleContext);
}

export function DebugConsoleProvider({ children }: { children: React.ReactNode }) {
    const [selectedDebugUnitId, setSelectedDebugUnitId] = useState<string | null>(null);
    const value = useMemo(
        () => ({ selectedDebugUnitId, setSelectedDebugUnitId }),
        [selectedDebugUnitId],
    );
    return <DebugConsoleContext.Provider value={value}>{children}</DebugConsoleContext.Provider>;
}
