---
name: writing-style-abilities
description: >-
  Writing style for abilities and cards: names, descriptions, keyword tooltip line
  format, hints, and in-battle wording. Use when editing Minion Battles ability or
  card player-facing text; read STYLE.md in this folder.
---

# Writing style — abilities

**Read** `STYLE.md` here before changing ability names, card text, tag hints, or UI strings that describe effects.

When editing `getTooltipText`, follow the **Keyword lines [Canon]** section in `STYLE.md`: each mechanical keyword gets its own array line containing only `{Keyword value}` — no periods, no prefixes, no prose.

**Final check before finishing any player-facing text:** read it as if printed on the card. Strike every word a player who knows the keywords would not miss (see **Cut list** in `STYLE.md`), and make sure every rule the text explains has a reminder card instead (see **Reminder card or card text?**).

Mechanical truth lives in code; **style docs** govern tone and clarity. For tag semantics and catalog copy, follow code pointers in the **editing-card-behaviour** and **working-with-skills** project skills—do not duplicate evolving enums here.
