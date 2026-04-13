import { EngineSnapshot } from "../GameSyncContext";
import { FetchMinimalStateResult, GameSyncContextController } from "./GameSyncContextController";

/**
 * Non-host minimal polling is implemented inline in `GameSyncContext.runMinimalBattlePoll`.
 * The host path is the only one that calls `fetchMinimalState` on the controller.
 */
export class ClientGameSyncContextController extends GameSyncContextController {
  pollTick(): void {
    throw new Error("Method not implemented.");
  }
  fetchMinimalState(_checkpointGameTick: number, _previousState: EngineSnapshot): Promise<FetchMinimalStateResult> {
    return Promise.reject(
      new Error("ClientGameSyncContextController.fetchMinimalState is not used; non-host polls inline in GameSyncContext."),
    );
  }
}
