# Armory Core

Conjured weapons and the objects they leave on the field. The tree's identity and ability list are in `ArmoryCore.md`.

A discarded or thrown sword is a real field object on the frame it is created: the slash impact, or the moment a thrown sword hits or reaches max range. Its resting picture stays hidden until the flight effect finishes. Game time and wall time both count, so an order pause does not freeze the picture. That hide-until-arrival check is `ConcealedArrivalClock` in `game/fieldObjects/concealedArrival.ts`. `FieldObjectManager` creates the object and its flight together.

| Path | Owns |
|---|---|
| `1001_CreateSword/` | Spend Charge and equip the conjured sword. Four blades orbit the caster, who can keep walking at a reduced speed |
| `1002_ImprovisedSword/` | The slash. The last hit discards the sword |
| `1003_ThrowSword/` | The throw. The sword becomes a token when the projectile stops |
| `1004_DeployTurret/` | Place the sentry |
| `armoryWeapons.ts` | Which abilities the conjured sword swaps in |
| `../../game/fieldObjects/` | Dropped weapons, sentries, landing, and the concealed-arrival clock |
