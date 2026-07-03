export {
    BattleNet,
    HostBattleNet,
    ClientBattleNet,
    createBattleNet,
    BATTLE_NET_T1_WAITING_POLLS,
    BATTLE_NET_T2_RESYNC_POLLS,
    BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS,
    BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS,
    BATTLE_NET_WAITING_HOST_PAUSED_STALL_MS,
    HOST_ANCHOR_WAIT_SHOW_MS,
    HOST_ANCHOR_RESYNC_MS,
    BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD,
    BATTLE_NET_MAX_DEFERRED_ORDERS,
    BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
} from './BattleNet';

export type {
    ApplyRemoteOrdersResult,
    BattleSessionHandle,
    BattleNetSyncTerminalStatus,
    BattleNetPollOnceOptions,
    BattleNetFactoryArgs,
	RemoteOrderWireRow,
	SubmitOrderOptions,
} from './BattleNet';
