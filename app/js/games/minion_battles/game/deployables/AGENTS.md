# Deployables

A **deployable** is anything on the map that abilities can find and interact with (a torch, a bramble patch, a campfire). It is a thin read-only *view*: each existing store keeps its own data, rendering and serialization, and exposes its entries through a provider. This folder owns the contract and the generic query.

## Files

| File | Owns |
|------|------|
| `Deployable.ts` | The `Deployable` view, tags, kinds, `DeployableQuery`, and the shared 5x5-tile reach constant. |
| `DeployableRegistry.ts` | `DeployableProvider` interface and the registry: `findDeployables` and `consumeDeployable`. |
| `DeployableRegistry.test.ts` | Query rules against fake providers. |
| `deployables.sync.test.ts` | Engine-level find/consume, checkpoint round trip and fingerprint coverage. |

## Providers

| Store | Lists |
|-------|-------|
| `game/lightSources/LightSourceManager.ts` | Light sources; tagged `lightEmitter` only while active, positive and not a `base` overlap method. |
| `game/TerrainLayerManager.ts` | Owned ground effects only (e.g. bramble, tagged `bramble`). Floor effects and ownerless effects are not listed. |
| `game/managers/SpecialTileManager.ts` | Light-emitting special tiles (campfires, crystals), always ownerless. |

The registry lives on `GameState` and is reached via `GameEngine.findDeployables` / `consumeDeployable` (also on `EngineContext` and `AbilityEngineContext`). The terrain provider resolves its manager lazily because `fromJSON` replaces it.

## Query rules

- `castingTeam` is required and a deployable only matches when its `teamId` equals it. **Ownerless (no team) deployables are story objects and are never returned for any team**, so campfires and crystals cannot be consumed. There is no `consumable` flag.
- Inactive entries are skipped unless asked for; results are nearest-first with a stable id tie-break.
- Preview and cast code must call it with identical arguments so they agree on the target.
- **Light emitter** means "deployable tagged `lightEmitter`"; the old `findDevourableLightSources` and `lightEmitters.ts` are removed.

## Interaction

Only one verb exists: `consume` (light source goes inactive, terrain effect is removed, special tiles refuse). Ability-specific behaviour such as detonating reads position and radius from the deployable, then calls `consumeDeployable`. Damage is deferred until a deployable needs HP.

## Making something a deployable

1. Add optional `ownerUnitId`, `ownerAbilityId`, `teamId` to the store's record and its JSON; missing fields must load as ownerless so old checkpoints still work.
2. Set them at every creation site from the casting unit.
3. Implement `DeployableProvider` on the store and register it in `GameState`'s constructor (lazily if the store is replaced on restore).
4. Add a tag in `Deployable.ts` if abilities need to filter on it.
5. Mix owner/ability/team into the determinism fingerprint (`game/Fingerprint.ts`) so ownership desyncs are detected; see the `game-sync-data-flow` skill.

Parent: `game/AGENTS.md`.
