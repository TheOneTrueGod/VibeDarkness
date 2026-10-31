# Field Objects

Things on the battlefield that are neither units nor projectiles: dropped weapon tokens and placed deployables. `FieldObjectManager` owns both, serializes them in the checkpoint, and ticks deployables. Each instance stores only its definition id and runtime state; every tuning number comes from a registered definition. Content registers definitions; engine code never imports content (`game/contentLayering.test.ts`).

Deployables are summoned, arrive (optionally flying in folded), trigger an action on a timer until their charges or lifetime run out, then leave. Today they cannot be attacked, collide with nothing, and nothing interacts with them. (They also appear in the `game/deployables/` lookup view as kind `placedDeployable`, alongside lights, brambles and dropped weapons.)

| File | Owns |
|---|---|
| `FieldObjectManager.ts` | Dropped weapons (created with their flight arc on the same frame) and placed deployables (spawn, trigger, expire, and the delivery projectile that becomes one when it lands: `launchDeployableDelivery` / `spawnDeliveredDeployable`). |
| `deployableDefs.ts` | `DeployableDef`: `visual` (painter id), `charges`, first-trigger delay, trigger interval, lifetime, optional `delivery` (speed, spin, radius), and an `action`: `shoot` (projectile at the nearest enemy in a cone) or `healPulse` (heal allies in a radius, ring effect). A restored deployable whose def is not registered is dropped with one warning. |
| `landing.ts` | Where a dropped weapon lands, and the engine defaults for its flight arc (the same for every weapon). |
| `weaponArt.ts` | Pixi textures for a token kind, read from `ConjuredWeaponDef.art` (see `../conjuredWeapons/AGENTS.md`). |
| `concealedArrival.ts` | `ConcealedArrivalClock`: a token exists on the frame it is created but stays hidden until its flight effect finishes, counting game and wall time. |

To add a deployable: register a `DeployableDef` from the content's `register.ts` (the Armory turret and Repair Post are the examples), cast it with `launchDeployableDelivery`, and spawn it from the ability's `onProjectileExpired` with `spawnDeliveredDeployable`. Placement uses `abilities/archetypes/deployablePlacement.ts`. A new behaviour is a new `DeployableAction` member handled in `FieldObjectManager.trigger`.

Drawing: `game/effect_defs/deployablePainters.ts` maps each `visual` to a painter (folded and placed, pips from `charges`, the owner's colour, and the clip each trigger plays from the ability's `animation`: the turret's barrel pull, the Repair Post's arc burst). Motion that must keep going while paused reads `deployableWallSeconds()`. `deployableDefs.test.ts` exercises both actions with test-only defs.
