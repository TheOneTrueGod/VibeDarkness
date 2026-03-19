import type { GameStatePayload } from '../../../types';
import DebugJsonBlock from '../DebugJsonBlock';

interface DebugGameStateTabProps {
    isActive: boolean;
    gameState: GameStatePayload | null;
}

export default function DebugGameStateTab({ isActive, gameState }: DebugGameStateTabProps) {
    if (!isActive) return null;

    return <DebugJsonBlock value={gameState} emptyText="No game state yet." />;
}

