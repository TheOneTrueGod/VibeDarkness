/** Props for the Minion Battles Game component. */
import type { PlayerState, GameSidebarInfo } from '../../types';
import type { LobbyClient } from '../../LobbyClient';
import type { GameComponentProps } from '../../components/GameScreen';
import type { QuestLobbyFields } from './storylines';
import type { RecordMissionResultFn } from './phaseHandlers/types';

export interface MinionBattlesGameProps extends Pick<GameComponentProps, 'minionBattlesApi' | 'onBattleNetResyncingChange' | 'headerSlot' | 'chatSlot' | 'centerOverlay'> {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    gameData: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    onRecordMissionResult?: RecordMissionResultFn;
    /** Host-only: mission-end DarknessStrength progression without addMissionResult (defeat). */
    onDarknessStrengthMissionEnd?: (
        outcome: 'victory' | 'defeat',
        promotions?: import('../../darknessStrength/progression').DarknessStrengthDataPromotion[]
    ) => Promise<void>;
    /** Loads this client's campaign Darkness Upgrades; only the host resolves its battle bag from it (rewards use the engine's active node ids for all players). */
    onLoadDarknessUpgrades?: () => Promise<import('../../types').DarknessUpgradesState | undefined>;
    /** Called when user clicks Leave in the defeat modal; receives the character id they were playing (undefined for spectators). */
    onLeave?: (characterId?: string) => void;
    /** Called when the player presses Continue after a victory; passes the campaign character id they
     *  brought (undefined for spectators/control-enemies). Falls back to onLeave if not provided. */
    onContinue?: (characterId: string | undefined, missionMapChapterId?: string | null) => void;
    /** Create a new lobby for the given mission (Try Again / Continue victory path).
     *  Returns true on success; false triggers the onContinue fallback.
     *  previousCharacterSelections carries the battle's character selections into the new lobby so
     *  players see their prior character pre-selected without having to re-pick.
     *  questLobby stamps questDefId / questRunId / questSlotIndex when continuing a quest chain. */
    onTryAgain?: (
        missionId: string,
        previousCharacterSelections: Record<string, string>,
        questLobby?: QuestLobbyFields | null,
    ) => Promise<boolean>;
    /** Called when host sends an emitted message (e.g. NPC chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: import('../../components/Chat').MessageEntry) => void;
    /** Called when the game is about to switch from pre-battle story into battle. */
    onBattleStartStatusChange?: (starting: boolean) => void;
    /** Client-only: join the next lobby that the host created after a victory. */
    onJoinNextLobby?: (lobbyId: string) => Promise<void>;
}
