export interface MinionBattlesDebugState {
    unitSelectorMode?: boolean;
    unitSelectorCallback?: (unitId: string) => void;
}

declare global {
    interface Window {
        debugState?: MinionBattlesDebugState;
    }
}

export function getDebugState(): MinionBattlesDebugState {
    window.debugState ??= {};
    return window.debugState;
}
