# Armory Core

Conjured weapons and the objects they leave on the field. The tree's identity and ability list are in `ArmoryCore.md`.

How swords and maces should differ — speed, hit band, lunge, bleed, knockback, stun — is in `../../../../researchTrees/trees/Weapons.md`. Read that before adding or retuning a conjured weapon. The shield has no held strike of its own: Release Charge is its held ability, with one use, and a weapon whose held ability should leave nothing sets `leaveTokenWhenHeldUsesEnd: false`. Charge Sword follows Swing Sword, and Charge Mace follows Swing Mace.

A discarded or thrown sword is a real field object on the frame it is created: the slash impact, or the moment a thrown sword hits or reaches max range. Its resting picture stays hidden until the flight effect finishes. Game time and wall time both count, so an order pause does not freeze the picture. That hide-until-arrival check is `ConcealedArrivalClock` in `game/fieldObjects/concealedArrival.ts`. `FieldObjectManager` creates the object and its flight together.

## Colour

Quench. The hex values live in `armoryConstants.ts`.

- **Primary** (`ARMORY_PRIMARY_COLOR`, blue-steel): tree chip, turret footprint, core disc, and the body of a conjured weapon.
- **Secondary** (`ARMORY_SECONDARY_COLOR`, bone): Charge, the slash trail, borders, the bright centre of the weapon, the turret barrel, and loaded shot pips.
- **Shade** (`ARMORY_PRIMARY_SHADE_COLOR`): the grip and empty pips. It is the primary with each channel scaled by `ARMORY_PRIMARY_SHADE_FACTOR`.
- Conjured-weapon fills are fully opaque, with a thin black outline, so a token reads on the ground. The resting token is drawn at full sprite alpha.
- `chargeSword.svg` is the upright picture: Create Sword, Charge Sword, the conjure orbit, the throw's flight, and the dropped token. `chargeSwordThrow.svg` is that sword tipped, with a short trail, and only the Throw Sword card uses it.
- `chargeMace.svg` is the upright picture: Create Mace, Charge Mace, the conjure orbit, and the dropped token. Whirl's card picture lives in `1007_Whirl/`. It uses this same palette.
- `shield.svg` is the upright buckler (rim, rivets, boss): Create Shield, the conjure orbit, the throw's flight, and the dropped token. `shieldThrow.svg` is that buckler tipped, with a short trail, for the Throw Shield card only. Release Charge's card picture lives in `1009_ReleaseCharge/`.
- The block arc is primary with a secondary edge. Release Charge's preview cone is the same, and its flash is secondary. The thrown buckler's trail is secondary.

| Path | Owns |
|---|---|
| `1001_CreateSword/` | Spend Charge and equip the conjured sword. Four blades orbit the caster, who can keep walking at a reduced speed |
| `1002_ImprovisedSword/` | Charge Sword, the slash. The last hit discards the sword |
| `chargeSword.svg` | Ghostly blade for Create Sword, Charge Sword, the throw's flight, and the dropped token |
| `chargeSwordThrow.svg` | Same blade, tipped and trailed, for the Throw Sword card only |
| `1003_ThrowSword/` | The throw. The sword becomes a token when the projectile stops |
| `1004_DeployTurret/` | The projectile that becomes the sentry when it lands |
| `1005_CreateMace/` | Spend Charge and equip the conjured mace. The orbit uses the mace picture |
| `1006_ChargeMace/` | Charge Mace, the swing. Same strike as Swing Mace. The last hit discards the mace |
| `1007_Whirl/` | The full-circle release, and the swung-mace card picture |
| `chargeMace.svg` | Ghostly mace for Create Mace, Charge Mace, the orbit, and the dropped token |
| `1008_CreateShield/` | A standard directional shield (`defineDirectionalShield`) that spends Charge, orbits bucklers, gains Charge on its first block, and equips the buckler when the block ends |
| `1009_ReleaseCharge/` | The held buckler's strike. Cone of Light's numbers through `defineConeStrike`, costs Charge, and leaves no token |
| `1010_ThrowShield/` | The throw. Strikes, bounces to the nearest enemy in `THROW_SHIELD_BOUNCE_RANGE` (`Projectile.bounceRange`), and becomes a token where it stops. Thick tapered trail |
| `shield.svg` | Buckler for Create Shield, the orbit, the throw's flight, and the dropped token |
| `shieldThrow.svg` | Same buckler, tipped and trailed, for the Throw Shield card only |
| `conjureCast.ts` | Shared Create pieces: drop any held weapon and start the orbit, then equip when the conjure window closes |
| `thrownWeapon.ts` | Shared throw flight and the token drop on `onProjectileExpired` |
| `armoryWeapons.ts` | Which abilities each conjured weapon swaps in |
| `../../game/fieldObjects/` | Dropped weapons, sentries, landing, and the concealed-arrival clock |
