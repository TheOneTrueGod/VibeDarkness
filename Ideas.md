People's Choices
Chip:  Crystal + Crystal
Clarence:  Crystal + Crystal
Voen: metal

Feedback May 7, 2026
[] Refactor LobbyManager.php.  It's huge and eating up lots of context
[] Create a skill for working with the debug tab, which gives the AI instructions on what each tab is, and where it lives

Feedback April 30, 2026

Things Gobi liked
- I liked the card system
- Enjoyed the differences in the missions

Things Gobi Doesn't like
- The slowness is annoying

- The alpha wolf is stunlockable.  introduce that "decaying stuns" mechanic.
- Make the darkness look more poisoney and deadly instead of just dark
[x] Ramp up darkness damage over time
- Boar didn't attack player 2
- Swing Bat didn't upgrade with the appropriate research
[x] Swing bat takes too long to cool down
[x] timeline view scrolls horizontally when there's an ability icon
[x] basic punch should only cost 1 stamina
- In multiplayer, all units spawn on the same position
[x] Spectators show up in the player list on the left
- Raise shield doesn't do anything?
- Increase the time it takes for a wolf to charge up its attack
- Hints on loss screen
[x] Make it so throw rock 2 shots a wolf
- Music and sound effects
- Make a "Creating an ability" skill
- Scroll wheel to zoom in and out (this should not change the actual distance between things)
- Shift click to make movement should in a straight line
[x] Make rock take precedence graphically over trees, so it doesn't look like there's gaps to move through
- There's an invisible wall in the top rightish of map 49_50
- You can keep playing when it's in "waiting for host" state
- Implement that "spawn point" idea.  In the second mission, have wolves only spawn from the west of the player.
- Create a way for admins to give a player a mission result.  Maybe "Copy my mission result" or something like that to give me options
- Make the dark damage animation more clear  Maybe larger particles that spawn farther away
[x] Make the campfire lose its light slower (but still be noticeable on turn 1)
- Adjust the cave so the campfire gives off light
[x] Make the darkness damage time take longer
- Stop long distance moves if an enemy gets within... 60?
- Do that plan you had for making effects more "In your face"
  - Have an "animation layer" where these things happen on.  Make it in front of the existing layers.
	- At the start of the fight, show the objectives in the center of the screen, then have them "animate" over to the right.  Replace part of the chat window with "objectives".
	- At the start of a round, show "Round Start" in big letters, and have the recoverySurges of the current player appear in big icons, then have particles fly out of them and to the relevant cards
	- When the dodge skill is used, have the particles fly out of the player's unit, and into the cards so the cause and effect are more tied together
- Reduce the number of clicks needed to go through the intro sequence (the "Start game" click is unneccessary, the voting screen is unneccessary when there's a spectator or in single player)
- Make the round marker more prominent.  Maybe a semicircle in the middle above the turn indicator?


--- Carried forward feedback
- Wolves are showing an attack forecast in the timeline but not doing it
[x] Enemies can move while stunned
- Fix bug where it doesn't use the card selected and instead
[x] Make sure that a new mission result overrides an old one

--- OLD FEEDBACK

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

