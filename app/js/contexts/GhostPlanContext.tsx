import { createContext } from 'react';
import type { GhostPlanData } from '../games/minion_battles/game/types';

export interface GhostPlanContextValue {
    ghostPlans: Record<string, GhostPlanData | null>;
    sendGhostPlan: (plan: GhostPlanData | null) => void;
}

export const GhostPlanContext = createContext<GhostPlanContextValue>({
    ghostPlans: {},
    sendGhostPlan: () => {},
});
