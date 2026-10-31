# Armory Core

Conjured weapons and the objects they leave on the field. The tree's identity and ability list are in `ArmoryCore.md`.

How swords and maces should differ — speed, hit band, lunge, bleed, knockback, stun — is in `../../../../researchTrees/trees/Weapons.md`. Read that before adding or retuning a conjured weapon. The shield has no held strike of its own: Release Charge is its held ability, with one use, and a weapon whose held ability should leave nothing sets `leaveTokenWhenHeldUsesEnd: false`. Charge Sword follows Swing Sword, and Charge Mace follows Swing Mace.

A discarded or thrown sword is a real field object on the frame it is created: the slash impact, or the moment a thrown sword hits or reaches max range. Its resting picture stays hidden until the flight effect finishes. Game time and wall time both count, so an order pause does not freeze the picture. That hide-until-arrival check is `ConcealedArrivalClock` in `game/fieldObjects/concealedArrival.ts`. `FieldObjectManager` creates the object and its flight together.

## How it is built

The Armory is content on top of generic engine pieces; the engine never imports this folder (`game/contentLayering.test.ts`).

- **Registration.** `registerArmoryContent()` in `register.ts` registers the three `ConjuredWeaponDef`s (with their `art`) and the turret and Repair Post `DeployableDef`s. Ability files do not import it for side effects. Tests that skip `abilities/AbilityRegistry.ts` call it in a `beforeAll`.
- **Archetypes.** Create Sword and Create Mace are `defineConjure` configs; Throw Sword and Throw Shield are `defineThrownWeapon` configs. Create Shield is a `defineDirectionalShield` with the conjure hooks, and Release Charge is a `defineConeStrike`. All live in `abilities/archetypes/`.
- **Engine definitions.** Weapons: `game/conjuredWeapons/AGENTS.md`. Deployables, tokens and landing: `game/fieldObjects/AGENTS.md`. Orbit, discard arc and whirl effects take their shape and colour from effect data (`game/effect_defs/weaponEffects.ts`), so the Armory passes its numbers in.
- **Colours** come from the `armory` theme, by role (below). Archetype colours default from the theme when a config leaves them out.

## Colour

Quench, the `armory` theme. The values and the role rules (primary, secondary, shade, font) live in `../../themes/` — read `themes/AGENTS.md` before choosing a colour. The `ARMORY_*_COLOR` exports in `armoryConstants.ts` read from that theme.

- **Primary** (blue-steel): tree chip, turret footprint, core disc, and the body of a conjured weapon.
- **Secondary** (bone): Charge, the slash trail, borders, the bright centre of the weapon, the turret barrel, and loaded shot pips.
- **Shade**: the grip and empty pips.
- Armory SVGs use only theme colours plus black and white; `themes/svgPalette.test.ts` enforces it.
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
| `1004_DeployTurret/` | The folded turret that becomes a placed deployable when it lands |
| `1011_RepairPost/` | Repair Post: a `healPulse` deployable that heals allies each quarter round; `repairPost.svg` is its card |
| `1005_CreateMace/` | Spend Charge and equip the conjured mace. The orbit uses the mace picture |
| `1006_ChargeMace/` | Charge Mace, the swing. Same strike as Swing Mace. The last hit discards the mace |
| `1007_Whirl/` | The full-circle release, and the swung-mace card picture |
| `chargeMace.svg` | Ghostly mace for Create Mace, Charge Mace, the orbit, and the dropped token |
| `1008_CreateShield/` | A standard directional shield (`defineDirectionalShield`) that spends Charge, orbits bucklers, gains Charge on its first block, and equips the buckler when the block ends |
| `1009_ReleaseCharge/` | The held buckler's strike. Cone of Light's numbers through `defineConeStrike`, costs Charge, and leaves no token |
| `1010_ThrowShield/` | The throw. Strikes, bounces to the nearest enemy in `THROW_SHIELD_BOUNCE_RANGE` (`Projectile.bounceRange`), and becomes a token where it stops. Thick tapered trail |
| `shield.svg` | Buckler for Create Shield, the orbit, the throw's flight, and the dropped token |
| `shieldThrow.svg` | Same buckler, tipped and trailed, for the Throw Shield card only |
| `register.ts` | `registerArmoryContent()`: the three conjured weapons (which abilities each swaps in, and their art) and the turret and Repair Post `DeployableDef`s. Called from `abilities/AbilityRegistry.ts` and `card_defs/index.ts`; idempotent |
| `armoryConstants.ts` | Ids, token kinds, the shared Charge cost, held-use counts, the shared conjure orbit, and the palette. One ability's tuning lives in its folder (`NNNNConstants.ts`); Charge pool numbers live in `resources/Charge.ts` |
| `armoryCore.test.ts` | Behaviour tests for every Armory ability |
