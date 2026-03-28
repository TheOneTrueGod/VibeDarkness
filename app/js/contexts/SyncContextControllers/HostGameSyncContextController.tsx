import { EngineSnapshot, extractWaitingUnitId, isWaitingForRemotePlayerOrder, remoteOrdersToApply } from "../GameSyncContext";
import { FetchMinimalStateResult, GameSyncContextController } from "./GameSyncContextController";

export class HostGameSyncContextController extends GameSyncContextController {
  pollTick(): void {
    throw new Error("Method not implemented.");
  }
  fetchMinimalState(checkpointGameTick: number, previousState: EngineSnapshot): Promise<FetchMinimalStateResult> {
    const gameId = this.gameId;
    if (!gameId) return Promise.reject("Can't fetch minimal state without game id");
    if (this.minimalStateInFlight) return Promise.reject("minimal state in flight");
    this.minimalStateInFlight = true;
    return new Promise<FetchMinimalStateResult>(async (resolve, reject) => {
      const result = await this.lobbyClient.getGameMinimalState(
        this.lobbyId,
        gameId,
        checkpointGameTick,
      );
      if (!result.orders?.length) {
        reject('no orders');
        return
      }

      const snapTick = Number(previousState.gameTick);
      const waitingUnitId = extractWaitingUnitId(previousState.state);
      const newOrders = remoteOrdersToApply(result.orders, snapTick, waitingUnitId, {
        localPlayerId: this.playerId,
        state: previousState.state,
        appliedKeys: this.appliedRemoteOrders,
      });
      const staleMergedOrdersReplay =
        newOrders.length === 0
        && result.orders.length > 0
        && !isWaitingForRemotePlayerOrder(previousState.state, this.playerId)
        && result.orders.every((o) => Number(o.gameTick) <= snapTick);
      if (staleMergedOrdersReplay) {
        this.logOrderPoll('host_stale_merged_orders_replay', {
          checkpointGameTick,
          snapTick,
          orderCount: result.orders.length,
        });
        reject('stale merged orders');
        return
      }

      resolve({
        gameTick: result.gameTick,
        synchash: result.synchash,
        orders: newOrders,
      })
    }).catch((reason) => {
      this.logOrderPoll('minimalBattlePollError(Host)', {
        checkpointGameTick,
        error: reason instanceof Error ? reason.message : reason ?? 'unknown',
      });
      throw reason
    }).finally(() => {
      this.minimalStateInFlight = false
    })
  }
}
