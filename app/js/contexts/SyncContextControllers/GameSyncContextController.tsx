import { LobbyClient } from "../../LobbyClient";
import { GameStatePayload } from "../../types";
import { EngineSnapshot } from "../GameSyncContext";

const ORDER_POLL_DEBUG = true;

export type FetchFullStateResult = {
  gameState: GameStatePayload;
};
export type FetchMinimalStateResult = {
  gameTick: number | null;
  synchash: string | null;
  orders: Array<{
    gameTick: number;
    order: Record<string, unknown>;
  }>;
}

export abstract class GameSyncContextController {
  protected minimalStateInFlight: boolean = false;
  protected fullStateInFlight: boolean = false;
  protected appliedRemoteOrders: Set<string> = new Set();

  constructor(
    protected lobbyClient: LobbyClient,
    protected lobbyId: string,
    protected playerId: string,
    protected gameId?: string
  ) {
    this.lobbyClient = lobbyClient;
    this.lobbyId = lobbyId;
    this.playerId = playerId;
    this.gameId = gameId;
  }

  abstract pollTick(): void;
  abstract fetchMinimalState(checkpointGameTick: number, previousState: EngineSnapshot): Promise<FetchMinimalStateResult>;

  fetchFullState(): Promise<FetchFullStateResult> {
    if (this.isFullStateInFlight) return Promise.reject();
    this.fullStateInFlight = true;
    return this.lobbyClient
      .getLobbyState(this.lobbyId, this.playerId)
      .then(({ gameState: gs }) => {
        const payload = gs as GameStatePayload;

        const phase = (payload?.game as Record<string, unknown> | undefined)?.gamePhase
          ?? (payload?.game as Record<string, unknown> | undefined)?.game_phase
          ?? null;

        this.logOrderPoll('fetchFullStateDone', {
          phase,
          gameId: payload?.gameId ?? null,
          gameTick:
            (payload?.game as Record<string, unknown> | undefined)?.gameTick
            ?? (payload?.game as Record<string, unknown> | undefined)?.game_tick
            ?? null,
        });

        this.appliedRemoteOrders.clear();
        return { gameState: payload };
      })
      .catch((err) => {
        console.error('Failed to fetch full game state:', err);
        this.logOrderPoll('fetchFullStateError', {
          err: err,
        });
        throw err;
      })
      .finally(() => {
        this.fullStateInFlight = false;
      });
  }

  get isMinimalStateInFlight(): boolean {
    return this.minimalStateInFlight;
  }

  get isFullStateInFlight(): boolean {
    return this.fullStateInFlight;
  }

  public dispose(): void {
    this.minimalStateInFlight = false;
    this.fullStateInFlight = false;
  }

  protected logOrderPoll(event: string, details: Record<string, unknown> = {}): void {
    if (!ORDER_POLL_DEBUG) return;
    console.debug(`[GameSync] ${event}`, details);
  }
}