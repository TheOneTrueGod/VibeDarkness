import { GameStatePayload } from "../../types";
import { EngineSnapshot } from "../GameSyncContext";
import { FetchFullStateResult, FetchMinimalStateResult, GameSyncContextController } from "./GameSyncContextController";

export class ClientGameSyncContextController extends GameSyncContextController {
  pollTick(): void {
    throw new Error("Method not implemented.");
  }
  fetchMinimalState(checkpointGameTick: number, previousState: EngineSnapshot): Promise<FetchMinimalStateResult> {
    // Non-host: minimal state + sync verification
    const gameId = this.gameId;
    if (!gameId) return Promise.reject("Can't fetch minimal state without game id");

    return new Promise<FetchMinimalStateResult>(async (resolve, reject) => {
      let minimalResult: FetchMinimalStateResult | null = null;
      try {
        minimalResult = await this.lobbyClient.getGameMinimalState(
          this.lobbyId,
          gameId,
          checkpointGameTick,
        );
      } catch {
        minimalResult = null;
      }
      if (!minimalResult) {
        this.logOrderPoll('minimalPollNoResult', { checkpointGameTick });
        reject('no result from get minimal state')
        return;
      }
/*
      const serverTick = minimalResult.gameTick ?? -1;
      const serverHash = minimalResult.synchash ?? null;
      const liveForTick = callbacks.getEngineSnapshot();
      const engineTick = Number(liveForTick?.gameTick ?? snapshot.gameTick);
      const waitingUnitId = extractWaitingUnitId(liveForTick?.state ?? snapshot.state);
      const stateForFilter = liveForTick?.state ?? snapshot.state;
      const pendingRemoteOrders = remoteOrdersToApply(
        minimalResult.orders,
        engineTick,
        waitingUnitId,
        {
          localPlayerId: playerId,
          state: stateForFilter,
          appliedKeys: appliedRemoteOrdersRef.current,
        },
      );
    });



    logOrderPoll('minimalPolled', {
      checkpointGameTick,
      serverTick,
      engineTick,
      serverOrders: minimalResult.orders.length,
      pendingRemoteOrders: pendingRemoteOrders.length,
      waitingUnitId,
    });

    if (serverTick < 0) {
      setCanSubmitOrders(false);
      consecutiveWaitCountRef.current += 1;
      setWaitingForHostReason('Host snapshot not available yet');
      setSyncStatus('waiting_for_host');
      return;
    }

    if (pendingRemoteOrders.length > 0) {
      setCanSubmitOrders(true);
      consecutiveWaitCountRef.current = 0
      setSyncStatus('synced');
      waitingForOrdersSynchashRef.current = null;
      callbacks.onOrdersReceived(pendingRemoteOrders);
      markAppliedRemoteOrders(pendingRemoteOrders, appliedRemoteOrdersRef.current);
      logOrderPoll('non_host_orders_received', {
        checkpointGameTick,
        receivedOrders: pendingRemoteOrders.length,
      });
      return;
    }

    if (Number(serverTick) === engineTick) {
      const stateForHash = liveForTick?.state ?? snapshot.state;
      const clientSynchash = await computeSynchash(stateForHash);
      if (serverHash !== null) {
        if (serverHash !== clientSynchash) {
          console.warn('Synchash mismatch vs server minimal state', {
            serverHash,
            clientSynchash,
            engineTick,
          });
          await doFullStateFetch({
            currentState: snapshot.state,
            reason: 'synchash_mismatch',
            serverTick,
            serverHash,
          });
          return;
        }
        waitingForOrdersSynchashRef.current = clientSynchash;
      }
      const hashAligned = serverHash !== null && serverHash === clientSynchash;
      const liveState = callbacks.getEngineSnapshot()?.state ?? snapshot.state;
      if (
        hashAligned
        && pendingRemoteOrders.length === 0
        && !(
          isWaitingForRemotePlayerOrder(liveState, playerId)
          && minimalResult.orders.length === 0
        )
      ) {
        logOrderPoll('non_host_hash_aligned_not_waiting', {
          checkpointGameTick,
          serverTick,
          engineTick,
          waitingForRemoteOrder: isWaitingForRemotePlayerOrder(liveState, playerId),
        });
        setCanSubmitOrders(true);
        consecutiveWaitCountRef.current = 0;
        setSyncStatus('synced');
        return;
      }
    }

    if (Number(serverTick) > engineTick && pendingRemoteOrders.length === 0) {
      await doFullStateFetch({
        currentState: snapshot.state,
        reason: 'client_fell_behind',
        serverTick,
        serverHash,
      });
      logOrderPoll('non_host_client_fell_behind_resync', {
        checkpointGameTick,
        serverTick,
        engineTick,
      });
      return;
    }

    setCanSubmitOrders(true);
    setSyncStatus('synced');
    if (Number(serverTick) < engineTick) {
      consecutiveWaitCountRef.current += 1;
      setWaitingForHostReason('Host is behind local simulation');
      setSyncStatus('waiting_for_host');
    } else {
      consecutiveWaitCountRef.current = 0;
    }*/
  }
}
