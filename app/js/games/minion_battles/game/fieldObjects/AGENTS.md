# Field Objects

Things on the battlefield that are neither units nor projectiles: dropped weapon tokens and sentries. `FieldObjectManager` owns both, serializes them in the checkpoint, and ticks sentries. Each instance stores only its definition id and runtime state; every tuning number comes from a registered definition. Content registers definitions; engine code never imports content (`game/contentLayering.test.ts`).

| File | Owns |
|---|---|
| `FieldObjectManager.ts` | Dropped weapons (created with their flight arc on the same frame) and sentries (spawn, fire, expire, and the delivery projectile that becomes a sentry when it lands). |
| `sentryDefs.ts` | `SentryDef`: shot damage, interval, count, first-shot delay, range and cone, shot hitbox and speed, lifetime, optional shot sprite, and an optional delivery projectile. A sentry instance keeps its `defId`; a restored sentry whose def is not registered is dropped with one warning. |
| `landing.ts` | Where a dropped weapon lands, and the engine defaults for its flight arc (the same for every weapon). |
| `weaponArt.ts` | Pixi textures for a token kind, read from `ConjuredWeaponDef.art` (see `../conjuredWeapons/AGENTS.md`). |
| `concealedArrival.ts` | `ConcealedArrivalClock`: a token exists on the frame it is created but stays hidden until its flight effect finishes, counting game and wall time. |

To add a sentry: register a `SentryDef` from the content's `register.ts` (the Armory turret is the example) and spawn it by `defId`. `sentryDefs.test.ts` fires a test-only def without Armory code. The turret's painter and pose geometry are turret-specific and live in `game/effect_defs/turretDeploy*.ts`.
