# Tutorials

Guided step sequences shown to one player in a battle. UI only: they never touch the simulation, and every
player sees their own.

## Where things live

| Piece | File |
|-------|------|
| Types (`TutorialDef`, triggers, pointer targets, advance conditions) | `tutorialTypes.ts` |
| Pure rules (which tutorial to show, step advancing, progress) | `tutorialLogic.ts` |
| Content | `storylines/<Storyline>/tutorials.ts`, listed in `storylines/tutorialRegistry.ts` |
| Battle hook (pick, advance, save) | `ui/pages/battlePhase/useBattleTutorial.ts` |
| Panel + pointer overlay | `ui/components/tutorial/TutorialOverlay.tsx` |

## Knowledge and progress

- Every tutorial names a `knowledgeKey`. One knowledge key carries zero, one or many tutorials
  (`tutorialsForKnowledge`).
- Progress is stored on the account: `knowledge[key].tutorials[tutorialId] = { step, done, updatedAt }`
  (`readTutorialProgress` in `app/js/accountKnowledge.ts`). No entry means not started; `done` means never
  show again. Removing the knowledge from an account (admin tools) resets its tutorials.
- The client saves through `POST /api/account/tutorial-progress`. The server accepts only keys in
  `backend/TutorialKnowledge.php`, which must match `PLAYER_RECORDABLE_KNOWLEDGE_KEYS` (every
  `type: 'tutorial'` knowledge; `app/js/tutorialKnowledgeSync.test.ts` checks this). New tutorial knowledge
  needs both entries.

## Adding a tutorial

1. Reuse a knowledge key, or add a `type: 'tutorial'` key to `accountKnowledge.ts` and `TutorialKnowledge.php`.
2. Write the `TutorialDef` in the storyline's `tutorials.ts` and list it in the storyline's export.
3. Steps point at things with `pointAt` (`unit` by characterId, `specialTile` by defId, `abilityCard` by
   ability ids, or any `hudAnchor`), and advance on a button (`next`) or a local order (`localOrder`,
   optionally requiring a move and/or specific abilities). A missing target just shows no pointer.

## Extending

- **New trigger:** add a variant to `TutorialTrigger` and a case in `triggerMatches`; feed the context it
  needs through `TutorialBattleContext`.
- **New advance condition:** add a `TutorialAdvance` and a `TutorialEvent` variant, handle it in
  `stepAdvancedBy`, and raise the event from `useBattleTutorial` (order events come from the
  `local_order_submitted` BattleSession event).
- **New pointer target:** add a `TutorialPointerTarget` variant and resolve it in `TutorialOverlay`'s
  `resolvePointer`. For DOM elements, register a `hudAnchors.ts` anchor rather than querying the DOM.

The hook picks at most one tutorial per battle mount, the first time the player can act (their turn, with
the objectives intro docked), and shows it only while they can act.
