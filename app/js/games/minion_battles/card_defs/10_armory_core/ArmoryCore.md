# Armory Core

Group 10. Conjured weapons replace the equipped weapon's abilities until they are thrown or their uses run out. Dropped weapons stay on the ground with no expiry. Turrets and repair posts are deployables (field objects), not units. The token exists on the frame it is created and stays hidden until its flight finishes; see `AGENTS.md`.

Create Sword (`1001`) spends Charge and equips Charge Sword (`1002`) plus Throw Sword (`1003`). Deploy Turret (`1004`) places a turret that shoots down a cone. Repair Post (`1011`) places a post that heals nearby allies each quarter round. Create Mace (`1005`) spends Charge and equips Charge Mace (`1006`) plus Whirl (`1007`). Create Shield (`1008`) spends Charge, blocks for one second, gains Charge on its first block, and equips Release Charge (`1009`) plus Throw Shield (`1010`). Charge is the shared resource.

The abilities are archetype configs (`defineConjure`, `defineThrownWeapon`, `defineDirectionalShield`, `defineConeStrike`) over engine-owned weapon and deployable definitions, registered by `registerArmoryContent()`. Colours come from the `armory` theme (`themes/AGENTS.md`). See `AGENTS.md` for the file map.
