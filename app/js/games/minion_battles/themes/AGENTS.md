# Themes

An ability theme is the palette of one ability group (and its research tree, resource, archetypes and art). Abilities pick colours by **role**, not by hex, so a group's look is changed in one place. The data module imports nothing from `card_defs/`; content, research trees, resources and archetypes import from here.

## Roles

The Armory (Quench) is the reference user.

| Role | Means | Armory examples |
|---|---|---|
| **Primary** | Mass: fills, bodies, discs, research border, telegraph fill | Turret body and footprint, the body of a conjured weapon, the block arc fill, the tree chip |
| **Secondary** | The event: edges, flashes, trails, the resource colour, conjure orbit tint | Charge, the conjure orbit, the slash and throw trails, the turret barrel and loaded pips, the block arc edge, Release Charge's flash |
| **Shade** | Dark detail, derived from primary by the shade factor | Weapon grips, empty shot pips |
| **Font** | Research card and pill text | Armory node card and pill text |

A theme without `secondary` falls back to primary, and without `font` leaves text alone. The two-tone themes are Armory, Storm, Court Magic, Command (the spirit animal, Aurora: pine `#0f766e` / lime `#d9f99d`) and Water (Tidewater: navy `#1e3a8a` / seafoam `#5eead4`); the rest are primary-only and equal that tree's old border colour. A two-tone group whose card art is all PNG is listed in `RASTER_ART_GROUPS` in `svgPalette.test.ts`.

## Using a theme

- **In abilities and engine code:** `getAbilityTheme(abilityId)` reads the group from the id's first two digits. Archetypes use `getTwoToneAbilityTheme`, which returns a theme only when it sets an explicit secondary, so primary-only groups keep the archetype's own defaults.
- **In UI and research trees:** `getThemeById(id)` with a short theme id. A tree def sets `theme:` to one of these ids.
- **Explicit colours win.** Archetype and effect colour options still work; the theme only fills what a caller omits.

## Giving a group its first secondary

1. Add `secondary` (and `font` if its research text needs it) to that theme in `abilityThemes.ts`.
2. Audit that group's archetype callers (`defineDirectionalShield`, `defineConeStrike`, ...): any that omit colours will now pick up primary / secondary. Pass explicit colours where the old look must stay.
3. The research chrome picks up the secondary and font automatically.
4. Paint the group's SVGs to the theme hexes; the palette guard starts checking that folder.

## SVG art

SVGs are painted by hand with the theme's hex values (primary, secondary, shade, font, plus black and white). There is no placeholder substitution. For every two-tone group, `svgPalette.test.ts` checks each SVG under that group's `card_defs/NN_*` folder; a deliberate exception goes in its per-file allow list with a comment.

| File | Owns |
|---|---|
| `abilityThemes.ts` | The theme data, and the group number to theme map |
| `abilityTheme.ts` | Types, the resolver (fallbacks, shade, number forms) and the lookups |
| `colorUtils.ts` | Shared hex / number / darken helpers |
| `svgPalette.test.ts` | The SVG palette guard |
| `themeDefaults.test.ts` | Archetype, telegraph and resource defaults read from the theme |
