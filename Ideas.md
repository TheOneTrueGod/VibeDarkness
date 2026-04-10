- Wolves are showing an attack forecast in the timeline but not doing it
- Enemies can move while stunned
- Fix bug where it doesn't use the card selected and instead
- Slime has slightly too much health


Chip:  Crystal + Crystal
Clarence:  Crystal + Crystal
Voen: metal
- Turn indicator isn't obvious enough
- Make sure that a new mission result overrides an old one
- Zoom
Move "Your Turn" down to line between timeline and cards
- Show an animation for when it's your Turn
- The Round indicator is too far away from the main sightlines of the player, and doesn't show how long it'll be until the round ends
- Tooltips on timeline can't be read
- Shield isn't showing up on timeline properly
- Fix icons not scaling properly in timeline view
- Show movement on timeline view?
- Flickering on refresh.  Is there a better way?

- Fix the tooltips on timeline
- A way to "pass until enemies spawn"?
- Make it ding when it's the players turn
- Make it possible to clear movement after you've queued it up
- Prevent the cards from highlighting when it's not your turn



Jeremy Thoughts:
- Fix up the 'start a mission' logic.  It's complicated and kind of messy, and co-owned by the frontend and backend.
- Script to cleanup old lobbies
- If you can get people to play simultaneously, then you can let them have more time to plan the turn
  - Give abilities a "teamwork" window near the end, which will cancel the rest of the cooldown if a friend's turn starts.
  - A player can also "flash cancel" during an ally's turn to stop whatever they are doing, and take an action
    - Once per round?
  - Then we can have a way to "play out" the turn and pause the playout when an ability needs a target
    - This will give a better preview of what will happen, but allies can interfere
  - Playout of allies orders, but don't "commit" the player until they are done their turn
- Define missions on the server.  Define rewards there too.  Then we can fetch a list of available missions, and the results for those missions can be changed.
  - Extension for later: Define map pieces and JS file in the mission defs.  Then we can load only the files specific to the mission.
  - Render enemy cards when hovering over their timeline action
  - Allow left-click to select enemy units, which will highlight them on the timeline
- Split up render of "resources earned" to "automatic + manual" with manual in red.

BATTLE EFFECTS
- Show damage numbers as bleed effect

CARDS
- Keep cards in the hand instead of discarding them.  Then show the recharge timer overtop of them when they have no uses left.
  - It should be possible for cards to be created and destroyed
- This can allow us to do away with the idea of the hand and discard entirely.

MISSIONS
- Split "story moments" into individual missions, so they can be completed and stored separately.
  - This also lends itself to a "map view" of sorts for campaigns

QUESTS
- A way to bring multiple missions together
- Currently similar to a "Campaign" -- this is an attempt to move the term of "Campaign" up one level.
- Example, the current one.  (CampfireChoice -> DefendWolf -> RetreatWolf -> CaveChoice1 -> GetFood -> CaveChoice2 -> BossFight )


- Mech powers;
  - Have armour parts that can be replaced.  "Summon Arm" -> replaces exo arm.
  - Have the armour weapons be very slow, but big AoE explosions

